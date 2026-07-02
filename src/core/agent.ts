import type {
    Action,
    AfterTurnProcessor,
    AgentContextControl,
    ConfigNotifier,
    ContextProcessor,
    ContextProvider,
    ErrorHandler,
    LLMRequest,
    LLMRequire,
    LLMResponse,
    Message,
    MessageChunk,
    MessageNotifier,
    PersistRequire,
    TokenCount,
    Tool,
    ToolCallMessage,
    ToolResultMessage,
    TurnContextAppender,
    TurnContextConsumer,
} from "./types.js";
import {
    ActionType,
    AfterTurnProcessorSchema,
    ConfigNotifierSchema,
    ContextProcessorSchema,
    ContextProviderSchema,
    ErrorHandlerSchema,
    LLMRequireSchema,
    LLMStreamChunkType,
    MessageNotifierSchema,
    MessageType,
    PersistRequireSchema,
    ToolResultMessageSchema,
    TurnContextAppenderSchema,
    TurnContextConsumerSchema,
} from "./types.js";
import {
    AgentConfigSchema,
    ThinkingLevel,
    normalizeGenerationConfig,
} from "./config.js";
import type {
    AgentConfig,
    GenerationConfig,
    GenerationConfigInput,
    LLMGenerateRequest,
    ModelProviderConfig,
    ModelSelector,
    NormalizedAgentConfig,
    ResolvedModel,
} from "./config.js";
import {
    availableModelIds,
    cloneAgentConfig,
    cloneGenerationConfig,
    cloneProviderConfig,
    cloneResolvedModel,
    selectorDescription,
    selectorFromResolvedModel,
    validateUniqueProviders,
} from "./model-config-utils.js";
import {
    resolveModelsFromProviders,
    selectResolvedModel,
} from "./model-resolution.js";
import { ToolProviderSchema, ToolSchema } from "../tool/types.js";
import type { ToolProvider } from "../tool/types.js";
import { ToolApproverSchema } from "../tool/approver.js";
import type { ToolApprover } from "../tool/approver.js";
import type { MessageSource } from "../store/message-source.js";
import { FileMessageSource } from "../store/message-source.js";
import type { Store } from "../store/store.js";
import { FileStore } from "../store/file-store.js";
import { EventEmitter } from "eventemitter3";
import type { AgentEventMap } from "./events.js";
import { StopException } from "./errors.js";
import { addTokenCount, emptyTokenCount } from "./llm.js";
import type { AgentModule, AgentRegistrable } from "./module.js";

export interface MiniAgentOptions {
    store?: Store;
    messageSource?: MessageSource;
}

export interface MiniAgentCreateOptions extends MiniAgentOptions {
    llm: LLMRequest;
    config: AgentConfig;
}

const DEFAULT_GENERATION_CONFIG = {
    temperature: 0.7,
    thinking: ThinkingLevel.Medium,
} satisfies GenerationConfig;

interface ToolCallBuffer {
    id?: string;
    name?: string;
    argumentsText: string;
}

function isCreateOptions(value: LLMRequest | MiniAgentCreateOptions): value is MiniAgentCreateOptions {
    return typeof value === "object"
        && value !== null
        && "llm" in value
        && "config" in value;
}

function getToolCallBuffer(buffers: ToolCallBuffer[], index: number): ToolCallBuffer {
    const existing = buffers[index];
    if (existing) {
        return existing;
    }
    const created: ToolCallBuffer = {
        argumentsText: "",
    };
    buffers[index] = created;
    return created;
}

function parseToolArguments(buffer: ToolCallBuffer): Record<string, unknown> {
    if (buffer.argumentsText.trim() === "") {
        return {};
    }
    return JSON.parse(buffer.argumentsText) as Record<string, unknown>;
}

export class MiniAgent {
    private readonly guid: string;
    private name: string;
    private messageSource: MessageSource;
    private llm: LLMRequest;
    private config: NormalizedAgentConfig;
    private providerConfigs: ModelProviderConfig[];
    private resolvedModels: ResolvedModel[];
    private currentModel: ResolvedModel | undefined;
    private generationConfig: GenerationConfig;
    private tools: Map<string, Tool> = new Map();
    private toolProviders: ToolProvider[] = [];
    private turnToolMap: Map<string, Tool> = new Map();
    private providers: ContextProvider[] = [];
    private processors: ContextProcessor[] = [];
    private notifiers: MessageNotifier[] = [];
    private errorHandlers: ErrorHandler[] = [];
    private afterTurnProcessors: AfterTurnProcessor[] = [];
    private configNotifiers: ConfigNotifier[] = [];
    private turnContextConsumers: TurnContextConsumer[] = [];
    private turnContextAppenders: TurnContextAppender[] = [];
    private approvers: ToolApprover[] = [];
    private store: Store;
    private emitter = new EventEmitter();
    private running = false;
    private stopped = false;
    private contextCount: TokenCount = emptyTokenCount();
    private toolAbortController: AbortController | null = null;
    private activeStream: AsyncGenerator<MessageChunk> | null = null;

    constructor(options: MiniAgentCreateOptions);
    constructor(llm: LLMRequest, config: AgentConfig, options?: MiniAgentOptions);
    constructor(
        llmOrOptions: LLMRequest | MiniAgentCreateOptions,
        config?: AgentConfig,
        options: MiniAgentOptions = {},
    ) {
        const resolvedOptions = isCreateOptions(llmOrOptions)
            ? llmOrOptions
            : {
                llm: llmOrOptions,
                config: config as AgentConfig,
                ...options,
            };

        this.guid = crypto.randomUUID();
        this.name = "";
        this.llm = resolvedOptions.llm;
        this.config = AgentConfigSchema.parse(resolvedOptions.config);
        this.providerConfigs = this.config.providers.map(cloneProviderConfig);
        validateUniqueProviders(this.providerConfigs);
        this.resolvedModels = resolveModelsFromProviders(this.providerConfigs, this.llm);
        this.currentModel = selectResolvedModel(this.resolvedModels, this.config.defaultModel);
        this.generationConfig = normalizeGenerationConfig(
            this.config.generation ?? DEFAULT_GENERATION_CONFIG,
        );
        this.syncEffectiveConfig();
        this.store = resolvedOptions.store ?? new FileStore(this.config.paths.sessiondir);
        this.messageSource = resolvedOptions.messageSource
            ?? new FileMessageSource(this.store, "messages.jsonl");
    }

    getGuid(): string {
        return this.guid;
    }

    getName(): string {
        return this.name;
    }

    setName(name: string): void {
        this.name = name;
    }

    on<K extends keyof AgentEventMap>(event: K, listener: AgentEventMap[K]): this {
        this.emitter.on(event, listener);
        return this;
    }

    once<K extends keyof AgentEventMap>(event: K, listener: AgentEventMap[K]): this {
        this.emitter.once(event, listener);
        return this;
    }

    off<K extends keyof AgentEventMap>(event: K, listener: AgentEventMap[K]): this {
        this.emitter.off(event, listener);
        return this;
    }

    removeAllListeners<K extends keyof AgentEventMap>(event?: K): this {
        this.emitter.removeAllListeners(event);
        return this;
    }

    private syncEffectiveConfig(): void {
        const defaultModel = this.currentModel
            ? selectorFromResolvedModel(this.currentModel)
            : this.config.defaultModel;
        this.config = AgentConfigSchema.parse({
            providers: this.providerConfigs.map(cloneProviderConfig),
            ...(defaultModel !== undefined && { defaultModel }),
            generation: cloneGenerationConfig(this.generationConfig),
            plugins: new Map(this.config.plugins),
            paths: { ...this.config.paths },
        });
    }

    private notifyConfigChanged(): void {
        this.syncEffectiveConfig();
        for (const notifier of this.configNotifiers) {
            void notifier.setConfig(this.getConfig());
        }
    }

    getConfig(): NormalizedAgentConfig {
        return cloneAgentConfig(this.config);
    }

    private getProviderConfigForModel(model: ResolvedModel): ModelProviderConfig {
        const provider = this.providerConfigs.find((entry) =>
            entry.provider === model.provider,
        );
        if (!provider) {
            throw new Error(`Provider not found for current model: ${model.provider}`);
        }
        return provider;
    }

    private requireCurrentModel(): ResolvedModel {
        if (!this.currentModel) {
            throw new Error("No model is available. Configure providers or register engine models first.");
        }
        return this.currentModel;
    }

    getModels(): ResolvedModel[] {
        return this.getResolvedModels();
    }

    getResolvedModels(): ResolvedModel[] {
        return this.resolvedModels.map(cloneResolvedModel);
    }

    getModelDisplayList(): string[] {
        return this.resolvedModels.map((model) => model.id);
    }

    getCurrentResolvedModel(): ResolvedModel | undefined {
        return this.currentModel ? cloneResolvedModel(this.currentModel) : undefined;
    }

    setResolvedModel(selector: ModelSelector): void {
        const selected = selectResolvedModel(this.resolvedModels, selector);
        if (!selected) {
            throw new Error(
                `Model not found: ${selectorDescription(selector)}. Available models: ${availableModelIds(this.resolvedModels)}`,
            );
        }
        this.currentModel = selected;
        this.notifyConfigChanged();
    }

    getGenerationConfig(): GenerationConfig {
        return cloneGenerationConfig(this.generationConfig);
    }

    setGenerationConfig(config: GenerationConfigInput | GenerationConfig): void {
        this.generationConfig = normalizeGenerationConfig({
            ...this.generationConfig,
            ...config,
        });
        this.notifyConfigChanged();
    }

    getContextCount(): TokenCount {
        return this.contextCount;
    }

    register(tool: Tool): void;
    register(toolProvider: ToolProvider): void;
    register(provider: ContextProvider): void;
    register(processor: ContextProcessor): void;
    register(notifier: MessageNotifier): void;
    register(errorHandler: ErrorHandler): void;
    register(afterTurnProcessor: AfterTurnProcessor): void;
    register(configNotifier: ConfigNotifier): void;
    register(persistRequire: PersistRequire): void;
    register(turnContextConsumer: TurnContextConsumer): void;
    register(turnContextAppender: TurnContextAppender): void;
    register(approver: ToolApprover): void;
    register(module: AgentModule): void;
    register(item: AgentRegistrable | AgentModule): void {
        let matched = false;
        const candidate = item as AgentRegistrable;

        if (ToolProviderSchema.safeParse(candidate).success) {
            matched = true;
            if (!this.toolProviders.includes(candidate as ToolProvider)) {
                this.toolProviders.push(candidate as ToolProvider);
            }
        }

        if (ToolSchema.safeParse(candidate).success) {
            matched = true;
            this.tools.set((candidate as Tool).name, candidate as Tool);
        }
        if (ContextProviderSchema.safeParse(candidate).success) {
            matched = true;
            if (!this.providers.includes(candidate as ContextProvider)) {
                this.providers.push(candidate as ContextProvider);
            }
        }
        if (AfterTurnProcessorSchema.safeParse(candidate).success) {
            matched = true;
            const processor = candidate as AfterTurnProcessor;
            if (processor.process.length >= 2 && !this.afterTurnProcessors.includes(processor)) {
                this.afterTurnProcessors.push(processor);
            }
        }
        if (ContextProcessorSchema.safeParse(candidate).success) {
            matched = true;
            const processor = candidate as ContextProcessor;
            if (processor.process.length < 2 && !this.processors.includes(processor)) {
                this.processors.push(processor);
            }
        }
        if (MessageNotifierSchema.safeParse(candidate).success) {
            matched = true;
            if (!this.notifiers.includes(candidate as MessageNotifier)) {
                this.notifiers.push(candidate as MessageNotifier);
            }
        }
        if (ErrorHandlerSchema.safeParse(candidate).success) {
            matched = true;
            if (!this.errorHandlers.includes(candidate as ErrorHandler)) {
                this.errorHandlers.push(candidate as ErrorHandler);
            }
        }
        if (ConfigNotifierSchema.safeParse(candidate).success) {
            matched = true;
            if (!this.configNotifiers.includes(candidate as ConfigNotifier)) {
                const notifier = candidate as ConfigNotifier;
                void notifier.setConfig(this.getConfig());
                this.configNotifiers.push(notifier);
            }
        }
        if (PersistRequireSchema.safeParse(candidate).success) {
            matched = true;
            const req = candidate as PersistRequire;
            void req.setStore(this.store);
        }
        if (LLMRequireSchema.safeParse(candidate).success) {
            matched = true;
            const req = candidate as LLMRequire;
            void req.setLLMRequest(this.llm);
        }
        if (TurnContextConsumerSchema.safeParse(candidate).success) {
            matched = true;
            if (!this.turnContextConsumers.includes(candidate as TurnContextConsumer)) {
                this.turnContextConsumers.push(candidate as TurnContextConsumer);
            }
        }
        if (TurnContextAppenderSchema.safeParse(candidate).success) {
            matched = true;
            if (!this.turnContextAppenders.includes(candidate as TurnContextAppender)) {
                this.turnContextAppenders.push(candidate as TurnContextAppender);
            }
        }
        if (ToolApproverSchema.safeParse(candidate).success) {
            matched = true;
            if (!this.approvers.includes(candidate as ToolApprover)) {
                this.approvers.push(candidate as ToolApprover);
            }
        }

        if (!matched) {
            throw new Error("Unsupported agent registration item");
        }
    }

    private async notify(message: Message): Promise<void> {
        this.emitter.emit("message:notify", { message });
        for (const notifier of this.notifiers) {
            await notifier.notify(message);
        }
    }

    async getMessages(): Promise<Message[]> {
        return this.messageSource.getAll();
    }

    async getMessage(id: string): Promise<Message | undefined> {
        return this.messageSource.get(id);
    }

    async setDiscardBefore(messageId: string): Promise<void> {
        await this.messageSource.setDiscardBefore(messageId);
    }

    async clearDiscardBefore(): Promise<void> {
        await this.messageSource.clearDiscardBefore();
    }

    async previewContext(): Promise<Message[]> {
        return this.buildContext();
    }

    private getAgentContextControl(): AgentContextControl {
        return {
            getMessages: async (): Promise<Message[]> => this.getMessages(),
            getMessage: async (id: string): Promise<Message | undefined> => this.getMessage(id),
            previewContext: async (): Promise<Message[]> => this.previewContext(),
            setDiscardBefore: async (messageId: string): Promise<void> => this.setDiscardBefore(messageId),
            clearDiscardBefore: async (): Promise<void> => this.clearDiscardBefore(),
        };
    }

    async getToolList(): Promise<Tool[]> {
        const map = new Map(this.tools);
        for (const provider of this.toolProviders) {
            const tools = await provider.getTools();
            for (const tool of tools) {
                map.set(tool.name, tool);
            }
        }
        return [...map.values()];
    }

    private async buildToolMap(): Promise<void> {
        this.turnToolMap = new Map(
            (await this.getToolList()).map((tool) => [tool.name, tool]),
        );
    }

    private async buildContext(): Promise<Message[]> {
        const context: Message[] = [];
        for (const appender of this.turnContextAppenders) {
            const messages = await appender.appendTurnContext();
            context.push(...messages);
        }

        const sortedProviders = [...this.providers].sort((a, b) => a.priority - b.priority);
        for (const provider of sortedProviders) {
            const messages = await provider.collect();
            context.push(...messages);
        }

        const processed = await this.applyProcessors(await this.messageSource.getAll());
        context.push(...processed);
        return context;
    }

    private async applyProcessors(messages: Message[]): Promise<Message[]> {
        if (this.processors.length === 0) {
            return messages;
        }

        const sorted = [...this.processors].sort((a, b) => a.priority - b.priority);
        const actions: Action[] = [];
        for (const processor of sorted) {
            const result = await processor.process(messages);
            actions.push(...result);
        }

        const deleteIds = new Set(
            actions.filter((action) => action.type === ActionType.Delete).map((action) => action.targetId),
        );

        const replaceMap = new Map<string, Message>();
        for (const action of actions) {
            if (action.type === ActionType.Replace) {
                replaceMap.set(action.targetId, action.message);
            }
        }

        const addFirst: Message[] = actions
            .filter((action): action is Extract<Action, { type: ActionType.AddFirst }> =>
                action.type === ActionType.AddFirst)
            .map((action) => action.message);

        const addLast: Message[] = actions
            .filter((action): action is Extract<Action, { type: ActionType.AddLast }> =>
                action.type === ActionType.AddLast)
            .map((action) => action.message);

        const mirror: Message[] = [];
        for (const message of messages) {
            if (deleteIds.has(message.id)) {
                continue;
            }
            mirror.push(replaceMap.get(message.id) ?? message);
        }

        return [...addFirst, ...mirror, ...addLast];
    }

    private async consumeTurnContext(turn: number, context: Message[]): Promise<void> {
        for (const consumer of this.turnContextConsumers) {
            await consumer.consumeTurnContext({ turn, context });
        }
    }

    private async requestApproval(toolName: string, args: Record<string, unknown>): Promise<boolean> {
        if (this.approvers.length === 0) {
            return true;
        }
        for (const approver of this.approvers) {
            const decision = await approver.requestApproval(toolName, args);
            if (!decision) {
                return false;
            }
        }
        return true;
    }

    async execute(toolCall: ToolCallMessage): Promise<ToolResultMessage> {
        this.emitter.emit("tool:execute", { toolCall });
        const approved = await this.requestApproval(
            toolCall.toolName,
            toolCall.arguments as Record<string, unknown>,
        );
        if (!approved) {
            const result = ToolResultMessageSchema.parse({
                id: crypto.randomUUID(),
                type: MessageType.ToolResult,
                toolCallId: toolCall.toolCallId,
                content: "Tool execution denied by user.",
            });
            this.emitter.emit("tool:result", { toolCall, result });
            return result;
        }
        const tool = this.turnToolMap.get(toolCall.toolName);
        let content: string;
        if (!tool) {
            content = `tool not found: ${toolCall.toolName}`;
        } else {
            const abortController = new AbortController();
            this.toolAbortController = abortController;
            try {
                content = await tool.execute(
                    toolCall.arguments as Record<string, unknown>,
                    abortController.signal,
                );
            } catch (error: unknown) {
                if (error instanceof StopException) {
                    throw error;
                }
                content = error instanceof Error ? error.message : String(error);
            } finally {
                this.toolAbortController = null;
            }
        }

        const result = ToolResultMessageSchema.parse({
            id: crypto.randomUUID(),
            type: MessageType.ToolResult,
            toolCallId: toolCall.toolCallId,
            content,
        });
        this.emitter.emit("tool:result", { toolCall, result });
        return result;
    }

    private async runAfterTurnProcessors(input: Message): Promise<void> {
        const sorted = [...this.afterTurnProcessors].sort((a, b) => a.priority - b.priority);
        const control = this.getAgentContextControl();
        for (const processor of sorted) {
            await processor.process(control, input);
        }
    }

    stop(): void {
        if (!this.running) {
            return;
        }
        this.stopped = true;
        this.toolAbortController?.abort();
        void this.activeStream?.return?.(undefined);
    }

    private async collectStreamResponse(stream: AsyncGenerator<MessageChunk>): Promise<LLMResponse> {
        let content = "";
        let reasoningContent = "";
        const toolCalls: ToolCallBuffer[] = [];
        this.activeStream = stream;
        try {
            for await (const chunk of stream) {
                this.emitter.emit("llm:chunk", { chunk });
                switch (chunk.type) {
                    case LLMStreamChunkType.TextDelta:
                        content += chunk.text;
                        break;
                    case LLMStreamChunkType.ReasoningDelta:
                        reasoningContent += chunk.text;
                        break;
                    case LLMStreamChunkType.ToolCallArgumentsDelta: {
                        const buffer = getToolCallBuffer(toolCalls, chunk.index);
                        buffer.argumentsText += chunk.argsText;
                        if (chunk.toolCallId !== undefined) {
                            buffer.id = chunk.toolCallId;
                        }
                        if (chunk.toolName !== undefined) {
                            buffer.name = chunk.toolName;
                        }
                        break;
                    }
                }
                if (this.stopped) {
                    await stream.return?.(undefined);
                    break;
                }
            }
        } finally {
            if (this.activeStream === stream) {
                this.activeStream = null;
            }
        }

        if (toolCalls.length > 0) {
            return {
                message: toolCalls.map((toolCall) => {
                    if (!toolCall.id) {
                        throw new Error("LLM stream ended without a tool call id");
                    }
                    if (!toolCall.name) {
                        throw new Error("LLM stream ended without a tool name");
                    }
                    return {
                        id: crypto.randomUUID(),
                        type: MessageType.ToolCall,
                        content,
                        toolCallId: toolCall.id,
                        toolName: toolCall.name,
                        arguments: parseToolArguments(toolCall),
                        ...(reasoningContent !== "" && { reasoningContent }),
                    };
                }),
                tokenCount: emptyTokenCount(),
            };
        }

        return {
            message: {
                id: crypto.randomUUID(),
                type: MessageType.Assist,
                content,
                ...(reasoningContent !== "" && { reasoningContent }),
            },
            tokenCount: emptyTokenCount(),
        };
    }

    private buildGenerateRequest(
        currentModel: ResolvedModel,
        context: Message[],
        tools: Tool[],
    ): LLMGenerateRequest {
        return {
            provider: cloneProviderConfig(this.getProviderConfigForModel(currentModel)),
            model: cloneResolvedModel(currentModel),
            messages: [...context],
            tools: [...tools],
            generation: cloneGenerationConfig(this.generationConfig),
        };
    }

    async run(input: Message): Promise<Message[]> {
        if (this.running) {
            throw new Error("Agent is already running");
        }
        this.running = true;
        this.stopped = false;
        this.emitter.emit("run:start", { input });
        await this.notify(input);
        await this.messageSource.add(input);

        let wasStopped: boolean;
        try {
            let turn = 0;
            while (!this.stopped) {
                turn++;
                this.emitter.emit("turn:start", { turn });
                try {
                    const currentModel = this.requireCurrentModel();
                    const context = await this.buildContext();
                    await this.consumeTurnContext(turn, context);
                    await this.buildToolMap();
                    const tools = [...this.turnToolMap.values()];
                    this.emitter.emit("llm:request", { context, tools });
                    const request = this.buildGenerateRequest(currentModel, context, tools);
                    const response = await this.collectStreamResponse(
                        this.llm.streamInvoke(request),
                    );
                    this.contextCount = addTokenCount(this.contextCount, response.tokenCount);
                    this.emitter.emit("llm:response", { response });

                    if (!Array.isArray(response.message)) {
                        await this.notify(response.message);
                        await this.messageSource.add(response.message);
                        this.emitter.emit("turn:end", { turn });
                        break;
                    }

                    const toolCalls = response.message;
                    for (const toolCall of toolCalls) {
                        await this.notify(toolCall);
                        await this.messageSource.add(toolCall);
                    }

                    for (const toolCall of toolCalls) {
                        const result = await this.execute(toolCall);
                        await this.notify(result);
                        await this.messageSource.add(result);
                    }
                    this.emitter.emit("turn:end", { turn });
                } catch (error: unknown) {
                    if (error instanceof StopException) {
                        this.stopped = true;
                        this.emitter.emit("turn:end", { turn });
                        break;
                    }

                    this.emitter.emit("run:error", { error, turn });

                    const candidates = this.errorHandlers
                        .filter((handler) => handler.canHandle(error))
                        .sort((a, b) => a.priority - b.priority);

                    if (candidates.length === 0) {
                        throw error;
                    }

                    for (const handler of candidates) {
                        await handler.handle(error);
                    }
                    continue;
                }
            }
        } finally {
            wasStopped = this.stopped;
            this.running = false;
            this.stopped = false;
            this.activeStream = null;
        }

        if (wasStopped) {
            this.emitter.emit("run:stop", undefined);
        }

        await this.runAfterTurnProcessors(input);
        const messages = await this.messageSource.getAll();
        this.emitter.emit("run:complete", { messages });
        return messages;
    }
}

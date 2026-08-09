import type {
    Action,
    AfterTurnProcessor,
    AgentContextControl,
    ContextProcessor,
    ContextProvider,
    Destroyable,
    ErrorHandler,
    LLMRequest,
    LLMRequire,
    Message,
    MessageChunk,
    MessageNotifier,
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
    ContextProcessorSchema,
    ContextProviderSchema,
    DestroyableSchema,
    ErrorHandlerSchema,
    LLMRequireSchema,
    MessageNotifierSchema,
    MessageType,
    ToolResultMessageSchema,
    TurnContextAppenderSchema,
    TurnContextConsumerSchema,
} from "./types.js";
import {
    AgentConfigSchema,
    ModelRuntimeSchema,
    PublicModelRuntimeSchema,
    ThinkingLevel,
    normalizeGenerationConfig,
} from "./config.js";
import type {
    AgentConfig,
    GenerationConfig,
    GenerationConfigInput,
    LLMGenerateRequest,
    ModelRuntime,
    NormalizedAgentConfig,
    PublicModelRuntime,
} from "./config.js";
import {
    ToolApproverSchema,
    ToolProviderSchema,
    ToolSchema,
    type ToolApprover,
    type ToolProvider,
} from "./tool.js";
import {
    MemoryMessageSource,
    MemoryStore,
    PersistRequireSchema,
    type MessageSource,
    type PersistRequire,
    type Store,
} from "./persistence.js";
import { EventEmitter } from "eventemitter3";
import type { AgentEventMap } from "./events.js";
import { StopException } from "./errors.js";
import { collectLLMResponse } from "./llm.js";
import type { AgentModule, AgentRegistrable } from "./module.js";
import {
    OneShotLLM,
    OneShotLLMRequireSchema,
    type OneShotLLMRequire,
} from "./one-shot-llm.js";
import {
    createTokenUsageService,
    type TokenUsageService,
} from "./token-usage.js";

export interface MiniAgentOptions {
    store?: Store;
    messageSource?: MessageSource;
    tokenUsage?: TokenUsageService;
}

export interface MiniAgentCreateOptions extends MiniAgentOptions {
    llm: LLMRequest;
    config: AgentConfig;
}

const DEFAULT_GENERATION_CONFIG = {
    temperature: 0.7,
    thinking: ThinkingLevel.Medium,
} satisfies GenerationConfig;

function isCreateOptions(value: LLMRequest | MiniAgentCreateOptions): value is MiniAgentCreateOptions {
    return typeof value === "object"
        && value !== null
        && "llm" in value
        && "config" in value;
}

export class MiniAgent {
    private readonly guid: string;
    private name: string;
    private messageSource: MessageSource;
    private llm: LLMRequest;
    private config: NormalizedAgentConfig;
    private currentModel: ModelRuntime | undefined;
    private generationConfig: GenerationConfig;
    private tools: Map<string, Tool> = new Map();
    private toolProviders: ToolProvider[] = [];
    private turnToolMap: Map<string, Tool> = new Map();
    private providers: ContextProvider[] = [];
    private processors: ContextProcessor[] = [];
    private notifiers: MessageNotifier[] = [];
    private errorHandlers: ErrorHandler[] = [];
    private afterTurnProcessors: AfterTurnProcessor[] = [];
    private turnContextConsumers: TurnContextConsumer[] = [];
    private turnContextAppenders: TurnContextAppender[] = [];
    private approvers: ToolApprover[] = [];
    private destroyables: Destroyable[] = [];
    private store: Store;
    private emitter = new EventEmitter();
    private running = false;
    private stopped = false;
    private destroyed = false;
    private tokenUsage: TokenUsageService;
    private toolAbortController: AbortController | null = null;
    private activeStream: AsyncGenerator<MessageChunk> | null = null;
    private activeRunPromise: Promise<Message[]> | undefined;

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
        this.generationConfig = normalizeGenerationConfig(
            this.config.generation ?? DEFAULT_GENERATION_CONFIG,
        );
        this.syncEffectiveConfig();
        this.store = resolvedOptions.store ?? new MemoryStore();
        this.tokenUsage = resolvedOptions.tokenUsage ?? createTokenUsageService();
        this.messageSource = resolvedOptions.messageSource
            ?? new MemoryMessageSource();
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
        this.config = AgentConfigSchema.parse({
            generation: { ...this.generationConfig },
            paths: { ...this.config.paths },
        });
    }

    getConfig(): NormalizedAgentConfig {
        return AgentConfigSchema.parse(this.config);
    }

    private requireCurrentModel(): ModelRuntime {
        if (!this.currentModel) {
            throw new Error("No model is configured. Call setModel() before run().");
        }
        return structuredClone(this.currentModel);
    }

    getModel(): PublicModelRuntime | undefined {
        if (!this.currentModel) {
            return undefined;
        }
        const { key: _, ...publicRuntime } = this.currentModel;
        return PublicModelRuntimeSchema.parse(publicRuntime);
    }

    setModel(runtime: ModelRuntime): void {
        this.ensureNotDestroyed();
        if (this.running) {
            throw new Error("Cannot change model while the agent is running");
        }
        this.currentModel = ModelRuntimeSchema.parse(runtime);
    }

    getGenerationConfig(): GenerationConfig {
        return { ...this.generationConfig };
    }

    setGenerationConfig(config: GenerationConfigInput | GenerationConfig): void {
        this.generationConfig = normalizeGenerationConfig({
            ...this.generationConfig,
            ...config,
        });
        this.syncEffectiveConfig();
    }

    getContextCount(): TokenCount {
        return this.tokenUsage.getTokenUsage();
    }

    resetContextCount(): void {
        this.tokenUsage.resetTokenUsage();
    }

    register(tool: Tool): void;
    register(toolProvider: ToolProvider): void;
    register(provider: ContextProvider): void;
    register(processor: ContextProcessor): void;
    register(notifier: MessageNotifier): void;
    register(errorHandler: ErrorHandler): void;
    register(afterTurnProcessor: AfterTurnProcessor): void;
    register(persistRequire: PersistRequire): void;
    register(turnContextConsumer: TurnContextConsumer): void;
    register(turnContextAppender: TurnContextAppender): void;
    register(approver: ToolApprover): void;
    register(destroyable: Destroyable): void;
    register(oneShotRequire: OneShotLLMRequire): void;
    register(module: AgentModule): void;
    register(item: AgentRegistrable | AgentModule): void {
        this.ensureNotDestroyed();
        let matched = false;
        const candidate = item as AgentRegistrable;

        if (DestroyableSchema.safeParse(candidate).success) {
            matched = true;
            this.trackDestroyable(candidate as Destroyable);
        }

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
        if (OneShotLLMRequireSchema.safeParse(candidate).success) {
            matched = true;
            const req = candidate as OneShotLLMRequire;
            req.setOneShotLLMFactory({
                create: () => new OneShotLLM(
                    this.llm,
                    this.requireCurrentModel(),
                    this.getGenerationConfig(),
                    this.tokenUsage,
                ),
            });
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

    private trackDestroyable(destroyable: Destroyable): void {
        if (!this.destroyables.includes(destroyable)) {
            this.destroyables.push(destroyable);
        }
    }

    private ensureNotDestroyed(): void {
        if (this.destroyed) {
            throw new Error("Agent has been destroyed.");
        }
    }

    async destroy(): Promise<void> {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.stop();
        const activeRunPromise = this.activeRunPromise;
        if (activeRunPromise !== undefined) {
            await activeRunPromise.catch(() => {});
        }

        const destroyables = [...this.destroyables].reverse();
        this.destroyables = [];
        for (const destroyable of destroyables) {
            try {
                await destroyable.destroy();
            } catch {
                // Best-effort cleanup should continue through all registered modules.
            }
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
        this.ensureNotDestroyed();
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

    private async collectStreamResponse(stream: AsyncGenerator<MessageChunk>) {
        this.activeStream = stream;
        try {
            return await collectLLMResponse(stream, {
                onChunk: (chunk) => this.emitter.emit("llm:chunk", { chunk }),
                onTokenUsage: (tokenCount) => {
                    this.tokenUsage.reportTokenUsage(tokenCount);
                },
                shouldStop: () => this.stopped,
            });
        } finally {
            if (this.activeStream === stream) {
                this.activeStream = null;
            }
        }
    }

    private buildGenerateRequest(
        currentModel: ModelRuntime,
        context: Message[],
        tools: Tool[],
    ): LLMGenerateRequest {
        return {
            runtime: structuredClone(currentModel),
            messages: [...context],
            tools: [...tools],
            generation: { ...this.generationConfig },
        };
    }

    async run(input: Message): Promise<Message[]> {
        this.ensureNotDestroyed();
        if (this.running) {
            throw new Error("Agent is already running");
        }
        const runPromise = this.runActive(input);
        this.activeRunPromise = runPromise;
        try {
            return await runPromise;
        } finally {
            if (this.activeRunPromise === runPromise) {
                this.activeRunPromise = undefined;
            }
        }
    }

    private async runActive(input: Message): Promise<Message[]> {
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

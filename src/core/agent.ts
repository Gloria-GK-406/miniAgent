import type {
    Message,
    Action,
    LLMRequest,
    Tool,
    ContextProvider,
    ContextProcessor,
    MessageNotifier,
    ErrorHandler,
    AfterTurnProcessor,
    ConfigNotifier,
    PersistRequire,
    TurnContextAppender,
    TurnContextConsumer,
    AgentContextControl,
    ToolCallMessage,
    ToolResultMessage,
    TokenCount,
    LLMRequire,
    ModelAwareLLMRequest,
} from "./types.js";
import {
    ActionType, MessageType, ToolResultMessageSchema,
    ContextProviderSchema, ContextProcessorSchema,
    MessageNotifierSchema, ErrorHandlerSchema, AfterTurnProcessorSchema,
    ConfigNotifierSchema, PersistRequireSchema, LLMRequireSchema,
    TurnContextAppenderSchema, TurnContextConsumerSchema,
    ModelAwareLLMRequestSchema,
} from "./types.js";
import { ToolSchema, ToolProviderSchema } from "../tool/types.js";
import type { ToolProvider } from "../tool/types.js";
import type { MessageSource } from "../store/message-source.js";
import { FileMessageSource } from "../store/message-source.js";
import {
    AgentConfigSchema,
    ModelPresetSchema,
    ThinkingLevel,
    normalizeGenerationConfig,
} from "./config.js";
import type {
    AgentConfig,
    GenerationConfig,
    GenerationConfigInput,
    ModelConfig,
    ModelPreset,
    ModelProviderConfig,
    ModelSelector,
    NormalizedAgentConfig,
    ResolvedModel,
} from "./config.js";
import type { Store } from "../store/store.js";
import { FileStore } from "../store/file-store.js";
import { EventEmitter } from "eventemitter3";
import type { AgentEventMap } from "./events.js";
import { StopException } from "./errors.js";
import { addTokenCount, emptyTokenCount } from "./llm.js";
import type { ToolApprover } from "../tool/approver.js";
import { ToolApproverSchema } from "../tool/approver.js";
import type { AgentModule, AgentRegistrable } from "./module.js";

export interface MiniAgentOptions {
    store?: Store;
    messageSource?: MessageSource;
}

function cloneResolvedModel(model: ResolvedModel): ResolvedModel {
    return {
        id: model.id,
        provider: model.provider,
        engine: model.engine,
        model: model.model,
        ...(model.displayName !== undefined && { displayName: model.displayName }),
        ...(model.contextSize !== undefined && { contextSize: model.contextSize }),
        ...(model.maxOutputTokens !== undefined && { maxOutputTokens: model.maxOutputTokens }),
        thinkingLevels: [...model.thinkingLevels],
    };
}

function cloneModelPreset(model: ModelPreset): ModelPreset {
    return {
        model: model.model,
        ...(model.displayName !== undefined && { displayName: model.displayName }),
        ...(model.contextSize !== undefined && { contextSize: model.contextSize }),
        ...(model.maxOutputTokens !== undefined && { maxOutputTokens: model.maxOutputTokens }),
        thinkingLevels: [...model.thinkingLevels],
    };
}

function getModelAwareLLM(llm: LLMRequest): ModelAwareLLMRequest | null {
    const parsed = ModelAwareLLMRequestSchema.safeParse(llm);
    return parsed.success ? parsed.data : null;
}

function addLegacyModelProvider(
    providers: Map<string, ModelProviderConfig>,
    model: ModelConfig,
): void {
    const existing = providers.get(model.provider);
    const preset: ModelPreset = ModelPresetSchema.parse({
        model: model.model,
        ...(model.contextSize !== undefined && { contextSize: model.contextSize }),
        ...(model.maxOutputTokens !== undefined && { maxOutputTokens: model.maxOutputTokens }),
        thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
    });

    if (!existing) {
        providers.set(model.provider, {
            name: model.provider,
            engine: model.provider,
            apiKey: model.apiKey,
            ...(model.baseUrl !== undefined && { baseUrl: model.baseUrl }),
            models: { add: [preset] },
        });
        return;
    }

    const additions = existing.models?.add ?? [];
    if (additions.some((entry) => entry.model === model.model)) {
        return;
    }
    existing.models = {
        ...(existing.models ?? {}),
        add: [...additions, preset],
    };
}

function legacyProvidersFromConfig(config: NormalizedAgentConfig): ModelProviderConfig[] {
    const providers = new Map<string, ModelProviderConfig>();
    if (config.model) {
        addLegacyModelProvider(providers, config.model);
    }
    for (const group of config.models.values()) {
        for (const model of group.models) {
            addLegacyModelProvider(providers, model);
        }
    }
    return [...providers.values()];
}

function resolveProviderModels(
    llm: ModelAwareLLMRequest | null,
    provider: ModelProviderConfig,
): ResolvedModel[] {
    const presets = new Map<string, ModelPreset>();
    const overrides = provider.models?.override ?? {};

    for (const preset of llm?.getEngineModels(provider.engine) ?? []) {
        const override = overrides[preset.model];
        const merged = ModelPresetSchema.parse({
            ...preset,
            ...(override ?? {}),
        });
        presets.set(merged.model, cloneModelPreset(merged));
    }

    for (const added of provider.models?.add ?? []) {
        presets.set(added.model, cloneModelPreset(added));
    }

    return [...presets.values()].map((preset): ResolvedModel => ({
        id: `${provider.name}/${preset.model}`,
        provider: provider.name,
        engine: provider.engine,
        model: preset.model,
        ...(preset.displayName !== undefined && { displayName: preset.displayName }),
        ...(preset.contextSize !== undefined && { contextSize: preset.contextSize }),
        ...(preset.maxOutputTokens !== undefined && { maxOutputTokens: preset.maxOutputTokens }),
        thinkingLevels: [...preset.thinkingLevels],
    }));
}

function resolveModels(
    llm: LLMRequest,
    providers: ModelProviderConfig[],
): ResolvedModel[] {
    const modelAwareLLM = getModelAwareLLM(llm);
    return providers.flatMap((provider) =>
        resolveProviderModels(modelAwareLLM, provider),
    );
}

function selectorDescription(selector: ModelSelector): string {
    if ("id" in selector) {
        return selector.id;
    }
    return `${selector.provider}/${selector.model}`;
}

function matchModels(models: ResolvedModel[], selector: ModelSelector): ResolvedModel[] {
    if ("id" in selector) {
        return models.filter((model) => model.id === selector.id);
    }
    return models.filter((model) =>
        model.provider === selector.provider && model.model === selector.model,
    );
}

function availableModelIds(models: ResolvedModel[]): string {
    return models.map((model) => model.id).join(", ") || "(none)";
}

function selectModel(
    models: ResolvedModel[],
    selector: ModelSelector,
    label = "Model",
): ResolvedModel {
    const matches = matchModels(models, selector);
    if (matches.length === 0) {
        throw new Error(`${label} not found: ${selectorDescription(selector)}. Available models: ${availableModelIds(models)}`);
    }
    if (matches.length > 1) {
        throw new Error(`${label} selector is ambiguous: ${selectorDescription(selector)}. Use one of: ${matches.map((model) => model.id).join(", ")}`);
    }
    return matches[0]!;
}

function selectInitialModel(
    config: NormalizedAgentConfig,
    models: ResolvedModel[],
): ResolvedModel {
    if (config.defaultModel) {
        return selectModel(models, config.defaultModel, "Default model");
    }
    if (config.model) {
        return selectModel(models, {
            provider: config.model.provider,
            model: config.model.model,
        }, "Default model");
    }
    const first = models[0];
    if (!first) {
        throw new Error("No models resolved. Configure provider models or register engine model catalogs.");
    }
    return first;
}

export class MiniAgent {
    private readonly guid: string;
    private name: string;
    private messageSource: MessageSource;
    private llm: LLMRequest;
    private config: NormalizedAgentConfig;
    private providerConfigs: ModelProviderConfig[] = [];
    private resolvedModels: ResolvedModel[] = [];
    private currentModel!: ResolvedModel;
    private generationConfig!: GenerationConfig;
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

    constructor(llm: LLMRequest, config: AgentConfig, options: MiniAgentOptions = {}) {
        this.guid = crypto.randomUUID();
        this.name = "";
        this.llm = llm;
        this.config = AgentConfigSchema.parse(config);
        this.providerConfigs = this.config.providers ?? legacyProvidersFromConfig(this.config);
        if (this.providerConfigs.length === 0) {
            throw new Error("No model providers configured. Configure providers or a legacy model.");
        }
        this.resolvedModels = resolveModels(this.llm, this.providerConfigs);
        this.currentModel = selectInitialModel(this.config, this.resolvedModels);
        this.generationConfig = normalizeGenerationConfig(this.config.generation);
        this.store = options.store ?? new FileStore(config.paths.sessiondir);
        this.messageSource = options.messageSource ?? new FileMessageSource(this.store, "messages.jsonl");
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

    getConfig(): NormalizedAgentConfig {
        return this.config;
    }

    private getLegacyModelConfig(): ModelConfig {
        const provider = this.getCurrentProviderConfig();
        return {
            provider: this.currentModel.engine,
            model: this.currentModel.model,
            apiKey: provider.apiKey,
            ...(provider.baseUrl !== undefined && { baseUrl: provider.baseUrl }),
            ...(this.currentModel.contextSize !== undefined && { contextSize: this.currentModel.contextSize }),
            ...(this.generationConfig.maxOutputTokens !== undefined
                ? { maxOutputTokens: this.generationConfig.maxOutputTokens }
                : this.currentModel.maxOutputTokens !== undefined && {
                    maxOutputTokens: this.currentModel.maxOutputTokens,
                }),
            temperature: this.generationConfig.temperature,
            ...(this.generationConfig.topP !== undefined && { topP: this.generationConfig.topP }),
            thinking: this.generationConfig.thinking !== ThinkingLevel.None,
        };
    }

    private getCurrentProviderConfig(): ModelProviderConfig {
        const provider = this.providerConfigs.find((entry) => entry.name === this.currentModel.provider);
        if (!provider) {
            throw new Error(`Provider not found for current model: ${this.currentModel.provider}`);
        }
        return provider;
    }

    getModels(): ResolvedModel[] {
        return this.resolvedModels.map(cloneResolvedModel);
    }

    /** @deprecated Use getModels() instead. */
    getModelList(): ResolvedModel[] {
        return this.getModels();
    }

    /** @deprecated Use getModels().map((model) => model.id) instead. */
    getModelDisplayList(): string[] {
        return this.getModels().map((model) => model.id);
    }

    getCurrentModel(): ResolvedModel {
        return cloneResolvedModel(this.currentModel);
    }

    setModel(selector: ModelSelector): void {
        this.currentModel = selectModel(this.resolvedModels, selector);
    }

    getGenerationConfig(): GenerationConfig {
        return { ...this.generationConfig };
    }

    setGenerationConfig(update: GenerationConfigInput): void {
        this.generationConfig = normalizeGenerationConfig({
            ...this.generationConfig,
            ...update,
        });
    }

    setModelByPath(path: string): void {
        this.setModel({ id: path });
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
                void notifier.setConfig(this.config);
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
            for (const t of tools) {
                map.set(t.name, t);
            }
        }
        return [...map.values()];
    }

    private async buildToolMap(): Promise<void> {
        this.turnToolMap = new Map(
            (await this.getToolList()).map((t) => [t.name, t]),
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
            actions.filter((a) => a.type === ActionType.Delete).map((a) => a.targetId),
        );

        const replaceMap = new Map<string, Message>();
        for (const action of actions) {
            if (action.type === ActionType.Replace) {
                replaceMap.set(action.targetId, action.message);
            }
        }

        const addFirst: Message[] = actions
            .filter((a): a is Extract<Action, { type: ActionType.AddFirst }> => a.type === ActionType.AddFirst)
            .map((a) => a.message);

        const addLast: Message[] = actions
            .filter((a): a is Extract<Action, { type: ActionType.AddLast }> => a.type === ActionType.AddLast)
            .map((a) => a.message);

        const mirror: Message[] = [];
        for (const msg of messages) {
            if (deleteIds.has(msg.id)) {
                continue;
            }
            mirror.push(replaceMap.get(msg.id) ?? msg);
        }

        return [...addFirst, ...mirror, ...addLast];
    }

    private async consumeTurnContext(turn: number, context: Message[]): Promise<void> {
        for (const consumer of this.turnContextConsumers) {
            await consumer.consumeTurnContext({ turn, context });
        }
    }

    private async requestApproval(toolName: string, args: Record<string, unknown>): Promise<boolean> {
        if (this.approvers.length === 0) return true;
        for (const approver of this.approvers) {
            const decision = await approver.requestApproval(toolName, args);
            if (!decision) return false;
        }
        return true;
    }

    async execute(toolCall: ToolCallMessage): Promise<ToolResultMessage> {
        this.emitter.emit("tool:execute", { toolCall });
        const approved = await this.requestApproval(toolCall.toolName, toolCall.arguments as Record<string, unknown>);
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
                content = await tool.execute(toolCall.arguments as Record<string, unknown>, abortController.signal);
            } catch (e: unknown) {
                if (e instanceof StopException) {
                    throw e;
                }
                content = e instanceof Error ? e.message : String(e);
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
                    const context = await this.buildContext();
                    await this.consumeTurnContext(turn, context);
                    await this.buildToolMap();
                    const tools = [...this.turnToolMap.values()];
                    this.emitter.emit("llm:request", { context, tools });
                    const modelAwareLLM = getModelAwareLLM(this.llm);
                    const stream = modelAwareLLM
                        ? modelAwareLLM.streamInvoke({
                            messages: context,
                            tools,
                            provider: this.getCurrentProviderConfig(),
                            model: this.currentModel,
                            generation: this.generationConfig,
                        })
                        : this.llm.streamInvoke(context, this.getLegacyModelConfig(), tools);
                    const unsubscribe = stream.onChunk((chunk) => {
                        this.emitter.emit("llm:chunk", { chunk });
                        if (this.stopped) {
                            stream.abort();
                        }
                    });
                    let response;
                    try {
                        response = await stream;
                    } finally {
                        unsubscribe();
                    }
                    this.contextCount = addTokenCount(this.contextCount, response.tokenCount);
                    this.emitter.emit("llm:response", { response });

                    if (!Array.isArray(response.message)) {
                        await this.notify(response.message);
                        await this.messageSource.add(response.message);
                        this.emitter.emit("turn:end", { turn });
                        break;
                    }

                    const toolCalls = response.message;
                    for (const tc of toolCalls) {
                        await this.notify(tc);
                        await this.messageSource.add(tc);
                    }

                    for (const tc of toolCalls) {
                        const result = await this.execute(tc);
                        await this.notify(result);
                        await this.messageSource.add(result);
                    }
                    this.emitter.emit("turn:end", { turn });
                } catch (e: unknown) {
                    if (e instanceof StopException) {
                        this.stopped = true;
                        this.emitter.emit("turn:end", { turn });
                        break;
                    }

                    this.emitter.emit("run:error", { error: e, turn });

                    const candidates = this.errorHandlers
                        .filter((h) => h.canHandle(e))
                        .sort((a, b) => a.priority - b.priority);

                    if (candidates.length === 0) {
                        throw e;
                    }

                    for (const handler of candidates) {
                        await handler.handle(e);
                    }
                    continue;
                }
            }
        } finally {
            wasStopped = this.stopped;
            this.running = false;
            this.stopped = false;
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

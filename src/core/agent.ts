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
} from "./types.js";
import {
    ActionType, MessageType, ToolResultMessageSchema,
    ContextProviderSchema, ContextProcessorSchema,
    MessageNotifierSchema, ErrorHandlerSchema, AfterTurnProcessorSchema,
    ConfigNotifierSchema, PersistRequireSchema,
    TurnContextAppenderSchema, TurnContextConsumerSchema,
} from "./types.js";
import { ToolSchema, ToolProviderSchema } from "../tool/types.js";
import type { ToolProvider } from "../tool/types.js";
import { MessageSource } from "./message-source.js";
import type { AgentConfig, ModelConfig } from "./config.js";
import { FileStore } from "./file-store.js";
import { EventEmitter } from "eventemitter3";
import type { AgentEventMap } from "./events.js";
import { StopException } from "./errors.js";
import { addTokenCount, emptyTokenCount } from "./llm.js";
import type { ToolApprover } from "../tool/approver.js";
import { ToolApproverSchema } from "../tool/approver.js";
import type { AgentModule, AgentRegistrable } from "./module.js";

export class MiniAgent {
    private messageSource: MessageSource;
    private llm: LLMRequest;
    private config: AgentConfig;
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
    private store: FileStore;
    private emitter = new EventEmitter();
    private running = false;
    private stopped = false;
    private contextCount: TokenCount = emptyTokenCount();
    private toolAbortController: AbortController | null = null;

    constructor(llm: LLMRequest, config: AgentConfig) {
        this.llm = llm;
        this.config = config;
        this.store = new FileStore(config.paths.sessiondir);
        this.messageSource = new MessageSource(this.store, "messages.jsonl");
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

    private applyConfig(config: AgentConfig): void {
        this.config = config;
        for (const notifier of this.configNotifiers) {
            void notifier.setConfig(config);
        }
    }

    getConfig(): AgentConfig {
        return this.config;
    }

    getModelList(): ModelConfig[] {
        const all: ModelConfig[] = [];
        for (const group of this.config.models.values()) {
            all.push(...group.models);
        }
        return all;
    }

    getModelDisplayList(): string[] {
        return this.getModelList().map((m) => `${m.provider}/${m.model}`);
    }

    getCurrentModel(): ModelConfig {
        return this.config.model;
    }

    setModel(config: ModelConfig): void {
        this.applyConfig({
            ...this.config,
            model: config,
        });
    }

    setModelByPath(path: string): void {
        const sep = path.indexOf("/");
        if (sep === -1) {
            throw new Error(`Invalid model path: "${path}". Expected format: provider/model`);
        }
        const provider = path.slice(0, sep);
        const model = path.slice(sep + 1);
        const group = this.config.models.get(provider);
        if (!group) {
            const available = [...this.config.models.keys()];
            throw new Error(`No models found for provider: "${provider}". Available providers: ${available.join(", ")}`);
        }
        const found = group.models.find((m) => m.model === model);
        if (!found) {
            throw new Error(`Model "${model}" not found for provider: "${provider}". Available: ${group.models.map((m) => m.model).join(", ")}`);
        }
        this.setModel(found);
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
        this.messageSource.setDiscardBefore(messageId);
    }

    async clearDiscardBefore(): Promise<void> {
        this.messageSource.clearDiscardBefore();
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
                    const stream = this.llm.streamInvoke(context, this.config.model, tools);
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

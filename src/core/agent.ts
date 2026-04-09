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
    TurnContextAware,
    TurnContextAppend,
    AgentContextControl,
    ToolCallMessage,
    ToolResultMessage,
} from "./types.js";
import {
    ActionType, MessageType, ToolResultMessageSchema,
    ContextProviderSchema, ContextProcessorSchema,
    MessageNotifierSchema, ErrorHandlerSchema, AfterTurnProcessorSchema,
    ConfigNotifierSchema, PersistRequireSchema,
    TurnContextAwareSchema, TurnContextAppendSchema,
} from "./types.js";
import { ToolSchema, ToolProviderSchema } from "../tool/types.js";
import type { ToolProvider } from "../tool/types.js";
import { MessageSource } from "./message-source.js";
import type { AgentConfig } from "./config.js";
import { FileStore } from "./file-store.js";
import { EventEmitter } from "eventemitter3";
import type { AgentEventMap } from "./events.js";
import { StopException } from "./errors.js";

export class MiniAgent {
    private messageSource: MessageSource;
    private llm: LLMRequest;
    private config: AgentConfig;
    private tools: Map<string, Tool> = new Map();
    private providers: ContextProvider[] = [];
    private processors: ContextProcessor[] = [];
    private notifiers: MessageNotifier[] = [];
    private errorHandlers: ErrorHandler[] = [];
    private afterTurnProcessors: AfterTurnProcessor[] = [];
    private configNotifiers: ConfigNotifier[] = [];
    private turnContextAwares: TurnContextAware[] = [];
    private turnContextAppenders: TurnContextAppend[] = [];
    private store: FileStore;
    private emitter = new EventEmitter();
    private running = false;
    private stopped = false;

    constructor(llm: LLMRequest, config: AgentConfig) {
        this.llm = llm;
        this.config = config;
        this.store = new FileStore(config.paths.basepersistdir);
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

    setConfig(config: AgentConfig): void {
        this.config = config;
        for (const notifier of this.configNotifiers) {
            void notifier.setConfig(config);
        }
    }

    getConfig(): AgentConfig {
        return this.config;
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
    register(turnContextAware: TurnContextAware): void;
    register(turnContextAppend: TurnContextAppend): void;
    register(item: Tool | ToolProvider | ContextProvider | ContextProcessor | MessageNotifier | ErrorHandler | AfterTurnProcessor | ConfigNotifier | PersistRequire | TurnContextAware | TurnContextAppend): void {
        if (ToolProviderSchema.safeParse(item).success) {
            const provider = item as ToolProvider;
            const tools = provider.getTools();
            const resolved = tools instanceof Promise ? tools : Promise.resolve(tools);
            resolved.then((ts) => {
                for (const t of ts) {
                    this.tools.set(t.name, t);
                }
            });
        }
        
        if (ToolSchema.safeParse(item).success) {
            this.tools.set((item as Tool).name, item as Tool);
        }
        if (ContextProviderSchema.safeParse(item).success) {
            if (!this.providers.includes(item as ContextProvider)) {
                this.providers.push(item as ContextProvider);
            }
        }
        if (AfterTurnProcessorSchema.safeParse(item).success) {
            const processor = item as AfterTurnProcessor;
            if (processor.process.length >= 2 && !this.afterTurnProcessors.includes(processor)) {
                this.afterTurnProcessors.push(processor);
            }
        }
        if (ContextProcessorSchema.safeParse(item).success) {
            const processor = item as ContextProcessor;
            if (processor.process.length < 2 && !this.processors.includes(processor)) {
                this.processors.push(processor);
            }
        }
        if (MessageNotifierSchema.safeParse(item).success) {
            if (!this.notifiers.includes(item as MessageNotifier)) {
                this.notifiers.push(item as MessageNotifier);
            }
        }
        if (ErrorHandlerSchema.safeParse(item).success) {
            if (!this.errorHandlers.includes(item as ErrorHandler)) {
                this.errorHandlers.push(item as ErrorHandler);
            }
        }
        if (ConfigNotifierSchema.safeParse(item).success) {
            if (!this.configNotifiers.includes(item as ConfigNotifier)) {
                const notifier = item as ConfigNotifier;
                void notifier.setConfig(this.config);
                this.configNotifiers.push(notifier);
            }
        }
        if (PersistRequireSchema.safeParse(item).success) {
            const req = item as PersistRequire;
            void req.setStore(this.store);
        }
        if (TurnContextAwareSchema.safeParse(item).success) {
            if (!this.turnContextAwares.includes(item as TurnContextAware)) {
                this.turnContextAwares.push(item as TurnContextAware);
            }
        }
        if (TurnContextAppendSchema.safeParse(item).success) {
            if (!this.turnContextAppenders.includes(item as TurnContextAppend)) {
                this.turnContextAppenders.push(item as TurnContextAppend);
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

    private async setTurnContext(turn: number, context: Message[]): Promise<void> {
        for (const aware of this.turnContextAwares) {
            await aware.setTurnContext({ turn, context });
        }
    }

    async execute(toolCall: ToolCallMessage): Promise<ToolResultMessage> {
        this.emitter.emit("tool:execute", { toolCall });
        const tool = this.tools.get(toolCall.toolName);
        const content = tool
            ? await tool.execute(toolCall.arguments as Record<string, unknown>)
            : `tool not found: ${toolCall.toolName}`;

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
                    await this.setTurnContext(turn, context);
                    const tools = [...this.tools.values()];
                    this.emitter.emit("llm:request", { context, tools });
                    const stream = this.llm.streamInvoke(context, this.config.model, tools);
                    const unsubscribe = stream.onChunk((chunk) => {
                        this.emitter.emit("llm:chunk", { chunk });
                    });
                    let response;
                    try {
                        response = await stream;
                    } finally {
                        unsubscribe();
                    }
                    this.emitter.emit("llm:response", { response });

                    if (this.stopped) {
                        this.emitter.emit("turn:end", { turn });
                        break;
                    }

                    if (!Array.isArray(response)) {
                        await this.notify(response);
                        await this.messageSource.add(response);
                        this.emitter.emit("turn:end", { turn });
                        break;
                    }

                    const toolCalls = response;
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

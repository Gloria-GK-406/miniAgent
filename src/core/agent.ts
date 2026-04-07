import type {
    Message,
    Action,
    LLMRequest,
    Tool,
    ToolRegistry,
    ContextProvider,
    ContextProviderRegistry,
    ContextProcessor,
    ContextProcessorRegistry,
    MessageNotifier,
    MessageNotifierRegistry,
    ErrorHandler,
    ErrorHandlerRegistry,
    AfterTurnProcessor,
    AfterTurnProcessorRegistry,
    ConfigNotifier,
    ConfigNotifierRegistry,
    ToolCallMessage,
    ToolResultMessage,
    FinishMessage,
} from "./types.js";
import {
    ActionType, MessageType, ToolResultMessageSchema, FinishMessageSchema,
    ContextProviderSchema, ContextProcessorSchema,
    MessageNotifierSchema, ErrorHandlerSchema, AfterTurnProcessorSchema,
    ConfigNotifierSchema,
} from "./types.js";
import { ToolSchema, ToolProviderSchema } from "../tool/types.js";
import type { ToolProvider, ToolProviderRegister } from "../tool/types.js";
import { MessageSource } from "./message-source.js";
import type { AgentConfig } from "./config.js";
import { EventEmitter } from "eventemitter3";
import type { AgentEventMap } from "./events.js";

export class MiniAgent implements ToolRegistry, ToolProviderRegister, ContextProviderRegistry, ContextProcessorRegistry, MessageNotifierRegistry, ErrorHandlerRegistry, AfterTurnProcessorRegistry, ConfigNotifierRegistry {
    private messageSource = new MessageSource();
    private llm: LLMRequest;
    private config: AgentConfig;
    private tools: Map<string, Tool> = new Map();
    private providers: ContextProvider[] = [];
    private processors: ContextProcessor[] = [];
    private notifiers: MessageNotifier[] = [];
    private errorHandlers: ErrorHandler[] = [];
    private afterTurnProcessors: AfterTurnProcessor[] = [];
    private configNotifiers: ConfigNotifier[] = [];
    private emitter = new EventEmitter();

    constructor(llm: LLMRequest, config: AgentConfig) {
        this.llm = llm;
        this.config = config;
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
    register(item: Tool | ToolProvider | ContextProvider | ContextProcessor | MessageNotifier | ErrorHandler | AfterTurnProcessor | ConfigNotifier): void {
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
            if (!this.afterTurnProcessors.includes(item as AfterTurnProcessor)) {
                this.afterTurnProcessors.push(item as AfterTurnProcessor);
            }
        }
        if (ContextProcessorSchema.safeParse(item).success) {
            if (!this.processors.includes(item as ContextProcessor)) {
                this.processors.push(item as ContextProcessor);
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
    }

    private async notify(message: Message): Promise<void> {
        this.emitter.emit("message:notify", { message });
        for (const notifier of this.notifiers) {
            await notifier.notify(message);
        }
    }

    private async buildContext(): Promise<Message[]> {
        const sortedProviders = [...this.providers].sort((a, b) => a.priority - b.priority);
        const context: Message[] = [];
        for (const provider of sortedProviders) {
            const messages = await provider.collect();
            context.push(...messages);
        }

        const processed = await this.applyProcessors(this.messageSource.getAll());
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

    async execute(toolCall: ToolCallMessage): Promise<ToolResultMessage | FinishMessage> {
        this.emitter.emit("tool:execute", { toolCall });
        const tool = this.tools.get(toolCall.toolName);
        const content = tool
            ? await tool.execute(toolCall.arguments as Record<string, unknown>)
            : `tool not found: ${toolCall.toolName}`;

        if (content === "stop") {
            const result = FinishMessageSchema.parse({
                id: crypto.randomUUID(),
                type: MessageType.Finish,
                content: "",
            });
            this.emitter.emit("tool:result", { toolCall, result });
            return result;
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
        for (const processor of sorted) {
            await processor.process(this.messageSource, input);
        }
    }

    async run(input: Message): Promise<Message[]> {
        this.emitter.emit("run:start", { input });
        await this.notify(input);
        this.messageSource.add(input);

        let turn = 0;
        while (true) {
            turn++;
            this.emitter.emit("turn:start", { turn });
            try {
                const context = await this.buildContext();
                const tools = [...this.tools.values()];
                this.emitter.emit("llm:request", { context, tools });
                const response = await this.llm.invoke(context, this.config.model, tools);
                this.emitter.emit("llm:response", { response });

                if (!Array.isArray(response)) {
                    await this.notify(response);
                    this.messageSource.add(response);
                    this.emitter.emit("turn:end", { turn });
                    break;
                }

                const toolCalls = response;
                for (const tc of toolCalls) {
                    await this.notify(tc);
                }

                const results = await Promise.all(
                    toolCalls.map(async (tc) => {
                        const result = await this.execute(tc);
                        return { tc, result };
                    }),
                );

                let shouldBreak = false;
                for (const { tc, result } of results) {
                    this.messageSource.add(tc);
                    if (result.type === MessageType.Finish) {
                        shouldBreak = true;
                        break;
                    }
                    await this.notify(result);
                    this.messageSource.add(result);
                }
                this.emitter.emit("turn:end", { turn });
                if (shouldBreak) {
                    break;
                }
            } catch (e: unknown) {
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

        await this.runAfterTurnProcessors(input);
        const messages = this.messageSource.getAll();
        this.emitter.emit("run:complete", { messages });
        return messages;
    }
}

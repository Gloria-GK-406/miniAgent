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
    ToolCallMessage,
    ToolResultMessage,
    FinishMessage,
} from "./types.js";
import { ActionType, MessageType, ToolResultMessageSchema, FinishMessageSchema } from "./types.js";
import { MessageSource } from "./message-source.js";
import type { AgentConfig } from "./config.js";

export class MiniAgent implements ToolRegistry, ContextProviderRegistry, ContextProcessorRegistry, MessageNotifierRegistry, ErrorHandlerRegistry, AfterTurnProcessorRegistry {
    private messageSource = new MessageSource();
    private llm: LLMRequest;
    private config: AgentConfig;
    private tools: Map<string, Tool> = new Map();
    private providers: ContextProvider[] = [];
    private processors: ContextProcessor[] = [];
    private notifiers: MessageNotifier[] = [];
    private errorHandlers: ErrorHandler[] = [];
    private afterTurnProcessors: AfterTurnProcessor[] = [];

    constructor(llm: LLMRequest, config: AgentConfig) {
        this.llm = llm;
        this.config = config;
    }

    setConfig(config: AgentConfig): void {
        this.config = config;
    }

    getConfig(): AgentConfig {
        return this.config;
    }

    register(tool: Tool): void;
    register(provider: ContextProvider): void;
    register(processor: ContextProcessor): void;
    register(notifier: MessageNotifier): void;
    register(errorHandler: ErrorHandler): void;
    register(afterTurnProcessor: AfterTurnProcessor): void;
    register(item: Tool | ContextProvider | ContextProcessor | MessageNotifier | ErrorHandler | AfterTurnProcessor): void {
        if ("execute" in item && "name" in item) {
            this.tools.set((item as Tool).name, item as Tool);
        }
        if ("collect" in item) {
            if (!this.providers.includes(item as ContextProvider)) {
                this.providers.push(item as ContextProvider);
            }
        }
        if ("process" in item && "priority" in item) {
            const fn = (item as { process: (...args: unknown[]) => unknown }).process;
            if (fn.length >= 2) {
                if (!this.afterTurnProcessors.includes(item as AfterTurnProcessor)) {
                    this.afterTurnProcessors.push(item as AfterTurnProcessor);
                }
            } else {
                if (!this.processors.includes(item as ContextProcessor)) {
                    this.processors.push(item as ContextProcessor);
                }
            }
        }
        if ("notify" in item) {
            if (!this.notifiers.includes(item as MessageNotifier)) {
                this.notifiers.push(item as MessageNotifier);
            }
        }
        if ("canHandle" in item && "handle" in item) {
            if (!this.errorHandlers.includes(item as ErrorHandler)) {
                this.errorHandlers.push(item as ErrorHandler);
            }
        }
    }

    private async notify(message: Message): Promise<void> {
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
        const tool = this.tools.get(toolCall.toolName);
        const content = tool
            ? await tool.execute(toolCall.arguments as Record<string, unknown>)
            : `tool not found: ${toolCall.toolName}`;

        if (content === "stop") {
            return FinishMessageSchema.parse({
                id: crypto.randomUUID(),
                type: MessageType.Finish,
                content: "",
            });
        }

        return ToolResultMessageSchema.parse({
            id: crypto.randomUUID(),
            type: MessageType.ToolResult,
            toolCallId: toolCall.toolCallId,
            content,
        });
    }

    private async runAfterTurnProcessors(input: Message): Promise<void> {
        const sorted = [...this.afterTurnProcessors].sort((a, b) => a.priority - b.priority);
        for (const processor of sorted) {
            await processor.process(this.messageSource, input);
        }
    }

    async run(input: Message): Promise<Message[]> {
        await this.notify(input);
        this.messageSource.add(input);

        while (true) {
            try {
                const context = await this.buildContext();
                const tools = [...this.tools.values()];
                const response = await this.llm.invoke(context, this.config.model, tools);

                if (!Array.isArray(response)) {
                    await this.notify(response);
                    this.messageSource.add(response);
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
                if (shouldBreak) {
                    break;
                }
            } catch (e: unknown) {
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
        return this.messageSource.getAll();
    }
}

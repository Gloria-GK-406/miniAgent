import type {
    AgentRuntimeAccess,
    AgentRuntimeRequire,
    ContextProvider,
    LLMRequest,
    LLMRequire,
    Message,
} from "../core/types.js";
import { LLMStreamChunkType, MessageType } from "../core/types.js";
import type { LLMGenerateRequest } from "../core/config.js";

const SUMMARIZE_PROMPT = `You are a conversation summarizer. Summarize the following conversation into a concise summary that preserves:
1. Key decisions made
2. Important facts discovered
3. Files modified and why
4. Any unresolved issues or next steps
5. Current task state

Be concise but complete. Write in third person.`;

function extractText(content: Message["content"]): string {
    if (typeof content === "string") return content;
    if (content.type === "text") return content.text;
    return "";
}

function buildFallbackSummary(messages: Message[]): string {
    return messages
        .map((m) => {
            return `[${m.type}]: ${extractText(m.content).slice(0, 200)}`;
        })
        .join("\n");
}

export interface CompressionConfig {
    maxMessages: number;
    keepRecent: number;
}

export type ContextCompressorOptions = Partial<CompressionConfig>;

export class ContextCompressor implements ContextProvider, LLMRequire, AgentRuntimeRequire {
    priority = -1000;
    private llm: LLMRequest | null = null;
    private runtimeAccess: AgentRuntimeAccess | null = null;
    private config: CompressionConfig;
    private messages: Message[] = [];
    private summary: string | null = null;
    private compressedCount = 0;

    constructor(config: ContextCompressorOptions);
    constructor(config: ContextCompressorOptions = {}) {
        this.config = {
            maxMessages: config.maxMessages ?? 50,
            keepRecent: config.keepRecent ?? 10,
        };
    }

    async setLLMRequest(llm: LLMRequest): Promise<void> {
        this.llm = llm;
    }

    setAgentRuntimeAccess(access: AgentRuntimeAccess): void {
        this.runtimeAccess = access;
    }

    getCompressedCount(): number {
        return this.compressedCount;
    }

    getSummary(): string | null {
        return this.summary;
    }

    updateMessages(messages: Message[]): void {
        this.messages = messages;
    }

    async maybeCompress(): Promise<void> {
        if (this.messages.length <= this.config.maxMessages) return;
        if (this.messages.length <= this.config.keepRecent) return;

        const oldMessages = this.messages.slice(0, -this.config.keepRecent);
        if (oldMessages.length === 0) return;

        await this.compress(oldMessages);
    }

    private async compress(messages: Message[]): Promise<void> {
        if (!this.llm || !this.runtimeAccess) return;
        const runtime = this.runtimeAccess.getModelRuntime();
        if (!runtime) return;
        const generationConfig = this.runtimeAccess.getGenerationConfig();

        const conversationText = messages
            .map((m) => {
                return `[${m.type}]: ${extractText(m.content)}`;
            })
            .join("\n");

        const summarizeRequest: Message = {
            id: "compress-request",
            type: MessageType.User,
            content: `${SUMMARIZE_PROMPT}\n\n---\nConversation to summarize:\n${conversationText}`,
        };

        try {
            const request: LLMGenerateRequest = {
                runtime,
                messages: [
                    { id: "compress-system", type: MessageType.System, content: SUMMARIZE_PROMPT },
                    summarizeRequest,
                ],
                tools: [],
                generation: generationConfig,
            };
            let summary = "";
            for await (const chunk of this.llm.streamInvoke(request)) {
                if (chunk.type === LLMStreamChunkType.TextDelta) {
                    summary += chunk.text;
                }
            }
            if (summary.trim() === "") {
                summary = buildFallbackSummary(messages);
            }
            this.summary = summary;
            this.compressedCount += messages.length;
        } catch {
            this.summary = buildFallbackSummary(messages);
            this.compressedCount += messages.length;
        }
    }

    async collect(): Promise<Message[]> {
        if (!this.summary) return [];
        return [
            {
                id: "compression-summary",
                type: MessageType.System,
                content: `## Conversation Summary (compressed ${this.compressedCount} messages)\n${this.summary}`,
            },
        ];
    }
}

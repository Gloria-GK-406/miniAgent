import type {
    ContextProvider,
    Message,
} from "../core/types.js";
import { MessageType } from "../core/types.js";
import type { OneShotLLMFactory, OneShotLLMRequire } from "../core/one-shot-llm.js";

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

export class ContextCompressor implements ContextProvider, OneShotLLMRequire {
    priority = -1000;
    private oneShotFactory: OneShotLLMFactory | null = null;
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

    setOneShotLLMFactory(factory: OneShotLLMFactory): void {
        this.oneShotFactory = factory;
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
        if (!this.oneShotFactory) return;

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
            const response = await this.oneShotFactory.create().invoke([
                { id: "compress-system", type: MessageType.System, content: SUMMARIZE_PROMPT },
                summarizeRequest,
            ]);
            const summary = Array.isArray(response.message)
                ? ""
                : typeof response.message.content === "string"
                    ? response.message.content
                    : response.message.content.type === "text"
                        ? response.message.content.text
                        : "";
            if (summary.trim() === "") {
                this.summary = buildFallbackSummary(messages);
            } else {
                this.summary = summary;
            }
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

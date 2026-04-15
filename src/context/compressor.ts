import type { Message, ContextProvider, LLMRequest, LLMResponse, ConfigNotifier, LLMRequire } from "../core/types.js";
import { MessageType } from "../core/types.js";
import type { ModelConfig, AgentConfig } from "../core/config.js";
import type { Tool } from "../tool/types.js";

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

export interface CompressionConfig {
    maxMessages: number;
    keepRecent: number;
}

export class ContextCompressor implements ContextProvider, LLMRequire, ConfigNotifier {
    priority = -1000;
    private llm: LLMRequest | null = null;
    private modelConfig: ModelConfig | null = null;
    private config: CompressionConfig;
    private messages: Message[] = [];
    private summary: string | null = null;
    private compressedCount = 0;

    constructor(config: Partial<CompressionConfig> = {}) {
        this.config = {
            maxMessages: config.maxMessages ?? 50,
            keepRecent: config.keepRecent ?? 10,
        };
    }

    async setLLMRequest(llm: LLMRequest): Promise<void> {
        this.llm = llm;
    }

    async setConfig(config: AgentConfig): Promise<void> {
        this.modelConfig = config.model;
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
        if (!this.llm || !this.modelConfig) return;

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
            const stream = this.llm.streamInvoke(
                [{ id: "compress-system", type: MessageType.System, content: SUMMARIZE_PROMPT }, summarizeRequest],
                this.modelConfig,
                [] as Tool[],
            );
            const response: LLMResponse = await stream;
            const content = response.message;
            if (!Array.isArray(content) && content.type === MessageType.Assist) {
                this.summary = extractText(content.content);
                this.compressedCount += messages.length;
            }
        } catch {
            const text = messages
                .map((m) => {
                    return `[${m.type}]: ${extractText(m.content).slice(0, 200)}`;
                })
                .join("\n");
            this.summary = text;
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

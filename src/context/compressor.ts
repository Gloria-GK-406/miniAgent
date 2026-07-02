import type { Message, ContextProvider, LLMRequest, ConfigNotifier, LLMRequire } from "../core/types.js";
import { LLMStreamChunkType, MessageType } from "../core/types.js";
import {
    AgentConfigSchema,
    ThinkingLevel,
    normalizeGenerationConfig,
} from "../core/config.js";
import type {
    AgentConfig,
    GenerationConfig,
    LLMGenerateRequest,
    ModelProviderConfig,
    NormalizedAgentConfig,
    ResolvedModel,
} from "../core/config.js";
import { cloneProviderConfig } from "../core/model-config-utils.js";
import { resolveModelsFromProviders, selectResolvedModel } from "../core/model-resolution.js";

const SUMMARIZE_PROMPT = `You are a conversation summarizer. Summarize the following conversation into a concise summary that preserves:
1. Key decisions made
2. Important facts discovered
3. Files modified and why
4. Any unresolved issues or next steps
5. Current task state

Be concise but complete. Write in third person.`;

const DEFAULT_GENERATION_CONFIG = {
    temperature: 0.7,
    thinking: ThinkingLevel.Medium,
} satisfies GenerationConfig;

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

export class ContextCompressor implements ContextProvider, LLMRequire, ConfigNotifier {
    priority = -1000;
    private llm: LLMRequest | null = null;
    private agentConfig: NormalizedAgentConfig | null = null;
    private generationConfig: GenerationConfig = { ...DEFAULT_GENERATION_CONFIG };
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
        this.agentConfig = AgentConfigSchema.parse(config);
        this.generationConfig = normalizeGenerationConfig(
            this.agentConfig.generation ?? DEFAULT_GENERATION_CONFIG,
        );
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
        if (!this.llm || !this.agentConfig) return;

        const selectedModel = this.selectSummaryModel();
        if (!selectedModel) return;

        const provider = this.getProviderConfigForModel(selectedModel);
        if (!provider) return;

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
                provider,
                model: selectedModel,
                messages: [
                    { id: "compress-system", type: MessageType.System, content: SUMMARIZE_PROMPT },
                    summarizeRequest,
                ],
                tools: [],
                generation: { ...this.generationConfig },
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

    private selectSummaryModel(): ResolvedModel | undefined {
        if (!this.llm || !this.agentConfig) return undefined;
        const resolvedModels = resolveModelsFromProviders(this.agentConfig.providers, this.llm);
        return selectResolvedModel(resolvedModels, this.agentConfig.defaultModel);
    }

    private getProviderConfigForModel(model: ResolvedModel): ModelProviderConfig | undefined {
        const provider = this.agentConfig?.providers.find((entry) => entry.provider === model.provider);
        return provider ? cloneProviderConfig(provider) : undefined;
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

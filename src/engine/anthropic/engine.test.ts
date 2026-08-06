import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingLevel, type LLMGenerateRequest } from "../../core/config.js";
import {
  LLMStreamChunkType,
  MessageType,
  type Message,
  type MessageChunk,
} from "../../core/types.js";
import { AnthropicEngine } from "./engine.js";

const anthropicMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function mockAnthropic(options: unknown) {
    anthropicMocks.constructor(options);
    return {
      messages: {
        create: anthropicMocks.create,
      },
    };
  }),
}));

async function* messageStream() {
  yield {
    type: "content_block_delta",
    index: 0,
    delta: {
      type: "text_delta",
      text: "hi",
    },
  } as never;
}

async function collect(stream: AsyncGenerator<MessageChunk>): Promise<MessageChunk[]> {
  const chunks: MessageChunk[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

function request(): LLMGenerateRequest {
  const messages: Message[] = [
    { id: "user-1", type: MessageType.User, content: "hello" },
  ];

  return {
    messages,
    tools: [],
    runtime: {
      provider: "anthropic",
      key: "anthropic-key",
      baseUrl: "https://anthropic-proxy.example",
      model: {
      name: "claude-sonnet-4-5",
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Low],
      },
    },
    generation: {
      temperature: 0.3,
      maxOutputTokens: 222,
      thinking: ThinkingLevel.Low,
    },
  };
}

describe("AnthropicEngine request mode", () => {
  beforeEach(() => {
    anthropicMocks.constructor.mockClear();
    anthropicMocks.create.mockReset();
    anthropicMocks.create.mockResolvedValue(messageStream());
  });

  it("uses request provider credentials and yields message chunks", async () => {
    const engine = new AnthropicEngine();

    await expect(collect(engine.streamGenerate(request()))).resolves.toEqual([
      { type: LLMStreamChunkType.TextDelta, text: "hi" },
    ]);

    expect(anthropicMocks.constructor).toHaveBeenCalledWith({
      apiKey: "anthropic-key",
      baseURL: "https://anthropic-proxy.example",
    });
    expect(anthropicMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-5",
        max_tokens: 222,
        output_config: { effort: "low" },
        stream: true,
      }),
    );
  });
});

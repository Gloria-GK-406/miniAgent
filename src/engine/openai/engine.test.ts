import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingLevel, type LLMGenerateRequest } from "../../core/index.js";
import {
  LLMStreamChunkType,
  MessageType,
  type Message,
  type MessageChunk,
} from "../../core/index.js";
import { OpenAIEngine } from "./engine.js";

const openAIMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  create: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function mockOpenAI(options: unknown) {
    openAIMocks.constructor(options);
    return {
      chat: {
        completions: {
          create: openAIMocks.create,
        },
      },
    };
  }),
}));

async function* completionStream() {
  yield {
    choices: [
      {
        delta: { content: "pong" },
        finish_reason: null,
        index: 0,
      },
    ],
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
    { id: "user-1", type: MessageType.User, content: "ping" },
  ];

  return {
    messages,
    tools: [],
    runtime: {
      provider: "openai",
      key: "openai-key",
      baseUrl: "https://proxy.example/v1",
      model: {
      name: "o3",
      thinkingLevels: [
        ThinkingLevel.None,
        ThinkingLevel.Low,
        ThinkingLevel.Medium,
        ThinkingLevel.High,
      ],
      },
    },
    generation: {
      temperature: 0.1,
      maxOutputTokens: 321,
      thinking: ThinkingLevel.High,
    },
  };
}

describe("OpenAIEngine request mode", () => {
  beforeEach(() => {
    openAIMocks.constructor.mockClear();
    openAIMocks.create.mockReset();
    openAIMocks.create.mockResolvedValue(completionStream());
  });

  it("creates a request-scoped client and yields SDK chunks", async () => {
    const engine = new OpenAIEngine();

    await expect(collect(engine.streamGenerate(request()))).resolves.toEqual([
      { type: LLMStreamChunkType.TextDelta, text: "pong" },
    ]);

    expect(openAIMocks.constructor).toHaveBeenCalledWith({
      apiKey: "openai-key",
      baseURL: "https://proxy.example/v1",
    });
    expect(openAIMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "o3",
        max_completion_tokens: 321,
        reasoning_effort: "high",
        stream: true,
      }),
    );
  });
});

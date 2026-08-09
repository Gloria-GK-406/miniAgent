import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingLevel, type LLMGenerateRequest } from "../../core/index.js";
import {
  LLMStreamChunkType,
  MessageType,
  type Message,
  type MessageChunk,
} from "../../core/index.js";
import { OpenAICompatibleEngine } from "./engine.js";

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
        delta: { content: "ok" },
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
    { id: "user-1", type: MessageType.User, content: "hi" },
  ];

  return {
    messages,
    tools: [],
    runtime: {
      provider: "openai-compatible",
      key: "request-key",
      baseUrl: "http://localhost:9000/v1",
      model: {
      name: "custom-model",
      maxOutputTokens: 1234,
      thinkingLevels: [ThinkingLevel.None],
      },
    },
    generation: {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 777,
      thinking: ThinkingLevel.None,
    },
  };
}

describe("OpenAICompatibleEngine request mode", () => {
  beforeEach(() => {
    openAIMocks.constructor.mockClear();
    openAIMocks.create.mockReset();
    openAIMocks.create.mockResolvedValue(completionStream());
  });

  it("uses request provider credentials and generation params", async () => {
    const engine = new OpenAICompatibleEngine();

    const stream = engine.streamGenerate(request());
    expect(stream[Symbol.asyncIterator]).toBeTypeOf("function");
    await expect(collect(stream)).resolves.toEqual([
      { type: LLMStreamChunkType.TextDelta, text: "ok" },
    ]);

    expect(openAIMocks.constructor).toHaveBeenCalledWith({
      apiKey: "request-key",
      baseURL: "http://localhost:9000/v1",
    });
    expect(openAIMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "custom-model",
        temperature: 0.2,
        top_p: 0.8,
        max_completion_tokens: 777,
        stream: true,
        stream_options: {
          include_usage: true,
        },
      }),
    );
  });
});

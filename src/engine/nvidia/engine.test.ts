import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingLevel, type LLMGenerateRequest } from "../../core/config.js";
import {
  LLMStreamChunkType,
  MessageType,
  type Message,
  type MessageChunk,
} from "../../core/types.js";
import { NVIDIAEngine } from "./engine.js";

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
        delta: { content: "<think>check</think>done" },
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
    provider: {
      provider: "nvidia",
      key: "nvidia-key",
    },
    model: {
      id: "nvidia/meta-llama-3-3-70b-instruct",
      provider: "nvidia",
      name: "meta/llama-3.3-70b-instruct",
      thinkingLevels: [ThinkingLevel.None],
    },
    generation: {
      temperature: 0.6,
      topP: 0.7,
      thinking: ThinkingLevel.None,
    },
  };
}

describe("NVIDIAEngine request mode", () => {
  beforeEach(() => {
    openAIMocks.constructor.mockClear();
    openAIMocks.create.mockReset();
    openAIMocks.create.mockResolvedValue(completionStream());
  });

  it("uses the NVIDIA default base URL and yields parsed thinking/text chunks", async () => {
    const engine = new NVIDIAEngine();

    await expect(collect(engine.streamGenerate(request()))).resolves.toEqual([
      { type: LLMStreamChunkType.ReasoningDelta, text: "check" },
      { type: LLMStreamChunkType.TextDelta, text: "done" },
    ]);

    expect(openAIMocks.constructor).toHaveBeenCalledWith({
      apiKey: "nvidia-key",
      baseURL: "https://integrate.api.nvidia.com/v1",
    });
    expect(openAIMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "meta/llama-3.3-70b-instruct",
        top_p: 0.7,
        stream: true,
      }),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingLevel, type LLMGenerateRequest } from "../../core/index.js";
import {
  LLMStreamChunkType,
  MessageType,
  type Message,
  type MessageChunk,
} from "../../core/index.js";
import { GLMEngine } from "./engine.js";

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
        delta: {
          content: "answer",
          reasoning_content: "think",
        },
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
      provider: "glm",
      key: "glm-key",
      model: {
      name: "glm-5.2",
      thinkingLevels: [
        ThinkingLevel.None,
        ThinkingLevel.Low,
        ThinkingLevel.Medium,
      ],
      },
    },
    generation: {
      temperature: 0.4,
      topP: 0.6,
      thinking: ThinkingLevel.Medium,
    },
  };
}

describe("GLMEngine request mode", () => {
  beforeEach(() => {
    openAIMocks.constructor.mockClear();
    openAIMocks.create.mockReset();
    openAIMocks.create.mockResolvedValue(completionStream());
  });

  it("uses the GLM default base URL and yields reasoning/text chunks", async () => {
    const engine = new GLMEngine();

    await expect(collect(engine.streamGenerate(request()))).resolves.toEqual([
      { type: LLMStreamChunkType.ReasoningDelta, text: "think" },
      { type: LLMStreamChunkType.TextDelta, text: "answer" },
    ]);

    expect(openAIMocks.constructor).toHaveBeenCalledWith({
      apiKey: "glm-key",
      baseURL: "https://open.bigmodel.cn/api/paas/v4",
    });
    expect(openAIMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "glm-5.2",
        top_p: 0.6,
        thinking: { type: "enabled" },
        reasoning_effort: "medium",
        stream: true,
      }),
    );
  });
});

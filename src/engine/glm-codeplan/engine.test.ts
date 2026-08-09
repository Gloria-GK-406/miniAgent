import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingLevel, type LLMGenerateRequest } from "../../core/index.js";
import {
  LLMStreamChunkType,
  MessageType,
  type Message,
  type MessageChunk,
} from "../../core/index.js";
import { GLMCodePlanEngine } from "./engine.js";

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
        delta: { content: "plan" },
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
    { id: "user-1", type: MessageType.User, content: "plan it" },
  ];

  return {
    messages,
    tools: [],
    runtime: {
      provider: "glm-codeplan",
      key: "codeplan-key",
      model: {
      name: "glm-5.2",
      thinkingLevels: [
        ThinkingLevel.None,
        ThinkingLevel.Low,
        ThinkingLevel.Medium,
        ThinkingLevel.High,
        ThinkingLevel.Max,
      ],
      },
    },
    generation: {
      temperature: 0.5,
      maxOutputTokens: 1000,
      thinking: ThinkingLevel.Max,
    },
  };
}

describe("GLMCodePlanEngine request mode", () => {
  beforeEach(() => {
    openAIMocks.constructor.mockClear();
    openAIMocks.create.mockReset();
    openAIMocks.create.mockResolvedValue(completionStream());
  });

  it("uses the CodePlan default base URL and request model name", async () => {
    const engine = new GLMCodePlanEngine();

    await expect(collect(engine.streamGenerate(request()))).resolves.toEqual([
      { type: LLMStreamChunkType.TextDelta, text: "plan" },
    ]);

    expect(openAIMocks.constructor).toHaveBeenCalledWith({
      apiKey: "codeplan-key",
      baseURL: "https://open.bigmodel.cn/api/coding/paas/v4",
    });
    expect(openAIMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "glm-5.2",
        max_completion_tokens: 1000,
        reasoning_effort: "max",
        stream: true,
      }),
    );
  });
});

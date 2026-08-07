import { describe, expect, it, vi } from "vitest";
import { collectLLMResponse, LLMEngineManager } from "./llm.js";
import { ThinkingLevel, type LLMGenerateRequest } from "./config.js";
import { LLMRequestSchema, LLMStreamChunkType, type MessageChunk } from "./types.js";

async function* chunkStream(text: string): AsyncGenerator<MessageChunk> {
  yield { type: LLMStreamChunkType.TextDelta, text };
}

function requestFor(provider: string, model: string): LLMGenerateRequest {
  return {
    messages: [],
    tools: [],
    runtime: {
      provider,
      key: "test-key",
      model: { name: model, thinkingLevels: [ThinkingLevel.None] },
    },
    generation: { temperature: 0.7, thinking: ThinkingLevel.Medium },
  };
}

describe("LLMEngineManager", () => {
  it("routes a complete runtime request by provider", async () => {
    const calls: LLMGenerateRequest[] = [];
    const manager = new LLMEngineManager();
    manager.register({
      name: "openai",
      streamGenerate(request) {
        calls.push(request);
        return chunkStream(request.runtime.model.name);
      },
    });
    const request = requestFor("openai", "gpt-5");

    const chunks = [];
    for await (const chunk of manager.streamInvoke(request)) chunks.push(chunk);

    expect(calls).toEqual([request]);
    expect(chunks).toEqual([{ type: LLMStreamChunkType.TextDelta, text: "gpt-5" }]);
  });

  it("rejects invalid engine registrations", () => {
    expect(() => new LLMEngineManager().register("openai" as never))
      .toThrow(/engine instance/i);
  });

  it("accepts request implementations without catalog discovery", () => {
    expect(LLMRequestSchema.safeParse({
      streamInvoke: () => chunkStream("ok"),
    }).success).toBe(true);
  });
});

describe("collectLLMResponse", () => {
  it("assembles deltas and retains the latest provider usage", async () => {
    const onTokenUsage = vi.fn();
    async function* stream(): AsyncGenerator<MessageChunk> {
      yield { type: LLMStreamChunkType.TextDelta, text: "answer" };
      yield {
        type: LLMStreamChunkType.Usage,
        tokenCount: { input: 10, output: 2, total: 12 },
      };
    }

    const response = await collectLLMResponse(stream(), { onTokenUsage });

    expect(response).toMatchObject({
      message: { content: "answer" },
      tokenCount: { input: 10, output: 2, total: 12 },
    });
    expect(onTokenUsage).toHaveBeenCalledOnce();
    expect(onTokenUsage).toHaveBeenCalledWith({ input: 10, output: 2, total: 12 });
  });

  it("returns zero usage when a stream provides none", async () => {
    const onTokenUsage = vi.fn();
    const response = await collectLLMResponse(chunkStream("answer"), { onTokenUsage });

    expect(response.tokenCount).toEqual({ input: 0, output: 0, total: 0 });
    expect(onTokenUsage).not.toHaveBeenCalled();
  });

  it("does not report when stopped after usage but before stream completion", async () => {
    let releaseStream!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    let usageSeen!: () => void;
    const seen = new Promise<void>((resolve) => {
      usageSeen = resolve;
    });
    let stopped = false;
    const onTokenUsage = vi.fn();
    async function* stream(): AsyncGenerator<MessageChunk> {
      yield {
        type: LLMStreamChunkType.Usage,
        tokenCount: { input: 3, output: 1, total: 4 },
      };
      await release;
    }

    const responsePromise = collectLLMResponse(stream(), {
      onChunk: (chunk) => {
        if (chunk.type === LLMStreamChunkType.Usage) usageSeen();
      },
      onTokenUsage,
      shouldStop: () => stopped,
    });
    await seen;
    stopped = true;
    releaseStream();
    await responsePromise;

    expect(onTokenUsage).not.toHaveBeenCalled();
  });

  it("does not report when final tool response assembly fails", async () => {
    const onTokenUsage = vi.fn();
    async function* stream(): AsyncGenerator<MessageChunk> {
      yield {
        type: LLMStreamChunkType.Usage,
        tokenCount: { input: 3, output: 1, total: 4 },
      };
      yield {
        type: LLMStreamChunkType.ToolCallArgumentsDelta,
        index: 0,
        argsText: "{invalid",
        toolCallId: "call-1",
        toolName: "tool",
      };
    }

    await expect(collectLLMResponse(stream(), { onTokenUsage }))
      .rejects.toThrow();
    expect(onTokenUsage).not.toHaveBeenCalled();
  });
});

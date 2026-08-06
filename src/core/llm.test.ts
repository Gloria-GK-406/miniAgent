import { describe, expect, it } from "vitest";
import { LLMEngineManager } from "./llm.js";
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

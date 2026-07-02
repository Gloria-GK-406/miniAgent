import { describe, expect, it } from "vitest";
import { LLMEngineManager } from "./llm.js";
import { LLMRequestSchema, LLMStreamChunkType, type MessageChunk } from "./types.js";
import { ThinkingLevel, type LLMGenerateRequest, type ModelPreset } from "./config.js";
import type { LLMEngine } from "./llm.js";

async function* chunkStream(text: string): AsyncGenerator<MessageChunk> {
  yield { type: LLMStreamChunkType.TextDelta, text };
}

function fakeEngine(name: string, models: ModelPreset[]) {
  return {
    name,
    getModels: () => models,
    streamGenerate: (request: LLMGenerateRequest) => chunkStream(request.model.name),
  } satisfies LLMEngine;
}

function requestFor(engineName: string, modelId: string, modelName: string) {
  return {
    messages: [],
    tools: [],
    provider: {
      provider: engineName,
      key: "test-key",
      models: [],
    },
    model: {
      id: modelId,
      provider: engineName,
      name: modelName,
      thinkingLevels: [ThinkingLevel.None],
    },
    generation: {
      temperature: 0.7,
      thinking: ThinkingLevel.Medium,
    },
  } satisfies LLMGenerateRequest;
}

describe("LLMEngineManager", () => {
  it("registers engine instances by engine.name", () => {
    const manager = new LLMEngineManager();
    manager.register(fakeEngine("openai", [
      { id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] },
    ]));

    expect(manager.getEngineModels("openai")).toEqual([
      {
        id: "fast",
        provider: "openai",
        name: "gpt-4o-mini",
        thinkingLevels: [ThinkingLevel.None],
      },
    ]);
  });

  it("returns cloned resolved model arrays from engine catalogs", () => {
    const manager = new LLMEngineManager();
    manager.register(fakeEngine("openai", [
      { id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] },
    ]));

    const models = manager.getEngineModels("openai");
    models[0]!.thinkingLevels.push(ThinkingLevel.Medium);

    expect(manager.getEngineModels("openai")).toEqual([
      {
        id: "fast",
        provider: "openai",
        name: "gpt-4o-mini",
        thinkingLevels: [ThinkingLevel.None],
      },
    ]);
  });

  it("streams a single LLMGenerateRequest to the selected engine", async () => {
    const calls: LLMGenerateRequest[] = [];
    const manager = new LLMEngineManager();
    manager.register({
      name: "openai",
      getModels: () => [
        { id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] },
      ],
      streamGenerate(request) {
        calls.push(request);
        return chunkStream(request.model.name);
      },
    });

    const request = requestFor("openai", "fast", "gpt-4o-mini");

    const chunks = [];
    for await (const chunk of manager.streamInvoke(request)) {
      chunks.push(chunk);
    }

    expect(calls).toEqual([request]);
    expect(chunks).toEqual([
      { type: LLMStreamChunkType.TextDelta, text: "gpt-4o-mini" },
    ]);
  });

  it("rejects legacy constructor registration at runtime", () => {
    const manager = new LLMEngineManager();

    expect(() => manager.register("openai" as never)).toThrow(
      /engine instance/i,
    );
  });

  it("parses request-mode LLMRequest implementations", async () => {
    const request = requestFor("openai", "fast", "gpt-4o-mini");
    const llmRequest = LLMRequestSchema.parse({
      getEngineModels: () => [
        {
          id: "fast",
          provider: "openai",
          name: "gpt-4o-mini",
          thinkingLevels: [ThinkingLevel.None],
        },
      ],
      streamInvoke: (received: LLMGenerateRequest) => chunkStream(received.model.name),
    });

    const chunks = [];
    for await (const chunk of llmRequest.streamInvoke(request)) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: LLMStreamChunkType.TextDelta, text: "gpt-4o-mini" },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import type { Tool } from "../tool/types.js";
import { LLMEngineManager, createLLMStreamHandle } from "./llm.js";
import { MessageType, type LLMResponse, type Message } from "./types.js";
import { ThinkingLevel, type LLMGenerateRequest, type ModelPreset } from "./config.js";

function resolvedResponse(text: string) {
  const response: LLMResponse = {
    message: {
      id: "assist-1",
      type: MessageType.Assist,
      content: text,
    },
    tokenCount: { input: 0, output: 0, total: 0 },
  };
  const controller = createLLMStreamHandle<LLMResponse>();
  controller.resolve(response);
  return controller.handle;
}

describe("LLMEngineManager", () => {
  it("registers engine instances by their name", async () => {
    const seen: LLMGenerateRequest[] = [];
    const manager = new LLMEngineManager();
    manager.register({
      name: "test-engine",
      getModels(): ModelPreset[] {
        return [{ model: "m", thinkingLevels: [ThinkingLevel.None] }];
      },
      streamGenerate(request: LLMGenerateRequest) {
        seen.push(request);
        return resolvedResponse(request.model.model);
      },
    });

    const request: LLMGenerateRequest = {
      messages: [{ id: "u", type: MessageType.User, content: "hi" }] as Message[],
      tools: [] as Tool[],
      provider: { name: "p", engine: "test-engine", apiKey: "k" },
      model: {
        id: "p/m",
        provider: "p",
        engine: "test-engine",
        model: "m",
        thinkingLevels: [ThinkingLevel.None],
      },
      generation: { temperature: 0.7, thinking: ThinkingLevel.Medium },
    };

    const response = await manager.streamInvoke(request);
    expect(response.message).toMatchObject({ content: "m" });
    expect(seen).toHaveLength(1);
  });

  it("exposes cloned models from a registered engine", () => {
    const presets: ModelPreset[] = [
      { model: "a", thinkingLevels: [ThinkingLevel.None] },
    ];
    const manager = new LLMEngineManager();
    manager.register({
      name: "catalog",
      getModels: () => presets,
      streamGenerate: () => resolvedResponse("ok"),
    });

    const models = manager.getEngineModels("catalog");
    models[0]!.thinkingLevels.push(ThinkingLevel.Medium);

    expect(manager.getEngineModels("catalog")).toEqual([
      { model: "a", thinkingLevels: [ThinkingLevel.None] },
    ]);
  });
});

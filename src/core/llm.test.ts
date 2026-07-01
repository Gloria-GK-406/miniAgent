import { describe, expect, it } from "vitest";
import type { Tool } from "../tool/types.js";
import { LLMEngineManager, createLLMStreamHandle, type LLMEngine } from "./llm.js";
import { LLMRequestSchema, MessageType, type LLMRequest, type LLMResponse, type Message } from "./types.js";
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

function generateRequest(engine: string, model: string): LLMGenerateRequest {
  return {
    messages: [{ id: "u", type: MessageType.User, content: "hi" }] as Message[],
    tools: [] as Tool[],
    provider: { name: "p", engine, apiKey: "k" },
    model: {
      id: `p/${model}`,
      provider: "p",
      engine,
      model,
      thinkingLevels: [ThinkingLevel.None],
    },
    generation: { temperature: 0.7, thinking: ThinkingLevel.Medium },
  };
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

    const request = generateRequest("test-engine", "m");

    const response = await manager.streamInvoke(request);
    expect(response.message).toMatchObject({ content: "m" });
    expect(seen).toHaveLength(1);
  });

  it("accepts public LLMEngine objects for instance registration", async () => {
    const manager = new LLMEngineManager();
    const engine: LLMEngine = {
      name: "public-engine",
      getModels(): ModelPreset[] {
        return [{ model: "public-model", thinkingLevels: [ThinkingLevel.None] }];
      },
      streamGenerate(request: LLMGenerateRequest) {
        return resolvedResponse(request.model.model);
      },
    };

    manager.register(engine);

    const response = await manager.streamInvoke(generateRequest("public-engine", "public-model"));
    expect(response.message).toMatchObject({ content: "public-model" });
  });

  it("implements LLMRequest with request-object streamInvoke support", async () => {
    const manager = new LLMEngineManager();
    manager.register({
      name: "request-engine",
      getModels: () => [{ model: "request-model", thinkingLevels: [ThinkingLevel.None] }],
      streamGenerate: (request: LLMGenerateRequest) => resolvedResponse(request.model.model),
    });
    const llmRequest: LLMRequest = manager;
    const parsedRequest = LLMRequestSchema.parse(llmRequest);

    const response = await parsedRequest.streamInvoke(generateRequest("request-engine", "request-model"));
    expect(response.message).toMatchObject({ content: "request-model" });
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

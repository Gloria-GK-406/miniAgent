import { describe, expect, it } from "vitest";
import type { Tool } from "../tool/types.js";
import {
  LLMEngineManager,
  createLLMStreamHandle,
  type LLMEngine,
  type ModelCatalogLLMEngine,
} from "./llm.js";
import {
  LLMRequestSchema,
  ModelAwareLLMRequestSchema,
  MessageType,
  type LLMRequest,
  type LLMResponse,
  type Message,
  type ModelAwareLLMRequest,
} from "./types.js";
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
  it("keeps LLMEngine compatible with legacy engines", async () => {
    const engine: LLMEngine = {
      streamGenerate(messages: Message[], tools: Tool[]) {
        return resolvedResponse(`${messages.length}:${tools.length}`);
      },
    };

    const response = await engine.streamGenerate(
      [{ id: "u", type: MessageType.User, content: "hi" }],
      [],
    );
    expect(response.message).toMatchObject({ content: "1:0" });
  });

  it("registers engine instances by their name", async () => {
    const seen: LLMGenerateRequest[] = [];
    const manager = new LLMEngineManager();
    const engine: ModelCatalogLLMEngine = {
      name: "test-engine",
      getModels(): ModelPreset[] {
        return [{ model: "m", thinkingLevels: [ThinkingLevel.None] }];
      },
      streamGenerate(request: LLMGenerateRequest) {
        seen.push(request);
        return resolvedResponse(request.model.model);
      },
    };
    manager.register(engine);

    const request = generateRequest("test-engine", "m");

    const response = await manager.streamInvoke(request);
    expect(response.message).toMatchObject({ content: "m" });
    expect(seen).toHaveLength(1);
  });

  it("accepts model catalog engine adapters for instance registration", async () => {
    const manager = new LLMEngineManager();
    const engine: ModelCatalogLLMEngine = {
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

  it("keeps LLMRequest compatible with legacy request implementations", async () => {
    const llmRequest: LLMRequest = {
      streamInvoke(messages: Message[], config, tools: Tool[]) {
        return resolvedResponse(`${config.model}:${messages.length}:${tools.length}`);
      },
    };
    const parsedRequest = LLMRequestSchema.parse(llmRequest);

    const response = await parsedRequest.streamInvoke(
      [{ id: "u", type: MessageType.User, content: "hi" }],
      {
        provider: "legacy-provider",
        model: "legacy-model",
        apiKey: "key",
      },
      [],
    );
    expect(response.message).toMatchObject({ content: "legacy-model:1:0" });
  });

  it("implements ModelAwareLLMRequest with request-object streamInvoke support", async () => {
    const manager = new LLMEngineManager();
    manager.register({
      name: "request-engine",
      getModels: () => [{ model: "request-model", thinkingLevels: [ThinkingLevel.None] }],
      streamGenerate: (request: LLMGenerateRequest) => resolvedResponse(request.model.model),
    });
    const llmRequest: ModelAwareLLMRequest = manager;
    const parsedRequest = ModelAwareLLMRequestSchema.parse(llmRequest);

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

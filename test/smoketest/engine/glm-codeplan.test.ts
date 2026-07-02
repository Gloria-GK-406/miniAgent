import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { GLMCodePlanEngine } from "../../../src/engine/glm-codeplan/index.js";
import { MessageType } from "../../../src/core/types.js";
import type { Message, Tool } from "../../../src/core/types.js";
import { ThinkingLevel, type ModelProviderConfig } from "../../../src/core/config.js";
import {
  getProviderConfig,
  getProviderModel,
  isProviderConfigured,
  invokeEngineForSmoke,
  isAssistResponse,
  isToolCallResponse,
} from "../helpers.js";
import { getTestImageBase64 } from "../image.js";
import { fail } from "node:assert";
import { log } from "node:console";

const PROVIDER = "GLM_CODEPLAN" as const;
const engine = new GLMCodePlanEngine();

describe.skipIf(!isProviderConfigured(PROVIDER))("GLM CodePlan Engine", () => {
  let providerConfig: ModelProviderConfig;
  let providerModel: string;

  beforeAll(() => {
    providerConfig = getProviderConfig(PROVIDER, "glm-codeplan");
    providerModel = getProviderModel(PROVIDER);
  });

  it("text: sends a text message and receives a response", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "Reply with exactly: pong" },
    ];
    const result = await invokeEngineForSmoke(engine, providerConfig, providerModel, messages, []);
    if (result === null) {
      return;
    }
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.message.content).toBeTruthy();
      log("result", result);      
      return;
    }

    fail("Expected an AssistMessage response");
  }, 20000);

  it("image: sends an image and gets a description", async () => {
    const imageData = getTestImageBase64();
    const messages: Message[] = [
      {
        id: "1",
        type: MessageType.User,
        content: {
          type: "image",
          mediaType: "image/png",
          data: imageData,
        },
      },
      {
        id: "2",
        type: MessageType.User,
        content: "Describe this image in one short sentence.",
      },
    ];
    const result = await invokeEngineForSmoke(engine, providerConfig, providerModel, messages, []);
    if (result === null) {
      return;
    }
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.message.content).toBeTruthy();
      log("Response content:", result.message.content);
      return;
    }

    fail("Expected an AssistMessage response");
  }, 20000);

  it("tool: calls a tool and returns the result", async () => {
    const tool: Tool = {
      name: "get_weather",
      description: "Get the current weather for a city",
      parameters: z.object({
        city: z.string().describe("City name"),
      }),
      execute: async () => "sunny, 25\u00B0C",
    };
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "What is the weather in Beijing?" },
    ];
    const result = await invokeEngineForSmoke(engine, providerConfig, providerModel, messages, [tool]);
    if (result === null) {
      return;
    }
    expect(isToolCallResponse(result)).toBe(true);
    if (isToolCallResponse(result)) {
      expect(result.message).toHaveLength(1);
      expect(result.message[0]!.toolName).toBe("get_weather");
      expect(result.message[0]!.arguments).toHaveProperty("city");
      log("Tool call:", result.message[0]);
      return;
    }

    fail("Expected a ToolCallMessage response");
  }, 20000);

  it("thinking: sends request with thinking enabled", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "What is 2+2? Reply with just the number." },
    ];
    const result = await invokeEngineForSmoke(engine, providerConfig, providerModel, messages, [], {
      generation: { thinking: ThinkingLevel.Medium },
    });
    if (result === null) {
      return;
    }
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.message.content).toBeTruthy();
      expect(result.message.reasoningContent).toBeDefined();
      log("Thinking response content:", result.message.reasoningContent);
      log("Response content:", result.message.content);
      return;
    }

    fail("Expected an AssistMessage response");
  }, 20000);

  it("thinking: sends request with thinking disabled", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "What is 3+3? Reply with just the number." },
    ];
    const result = await invokeEngineForSmoke(engine, providerConfig, providerModel, messages, [], {
      generation: { thinking: ThinkingLevel.None },
    });
    if (result === null) {
      return;
    }
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.message.content).toBeTruthy();
      expect(result.message.reasoningContent).toBeUndefined();
      log("Response content:", result.message.content);
      return;
    }

    fail("Expected an AssistMessage response");
  }, 20000);
});

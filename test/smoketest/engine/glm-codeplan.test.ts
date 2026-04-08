import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { GLMCodePlanEngine } from "../../../src/engine/glm-codeplan/index.js";
import { MessageType } from "../../../src/core/types.js";
import type { Message, Tool } from "../../../src/core/types.js";
import type { ModelConfig } from "../../../src/core/config.js";
import {
  getProviderConfig,
  isProviderConfigured,
  invokeEngineForSmoke,
  isAssistResponse,
  isToolCallResponse,
} from "../helpers.js";
import { getTestImageBase64 } from "../image.js";
import { fail } from "node:assert";
import { log } from "node:console";

const PROVIDER = "GLM_CODEPLAN" as const;

describe.skipIf(!isProviderConfigured(PROVIDER))("GLM CodePlan Engine", () => {
  let config: ModelConfig;

  beforeAll(() => {
    config = getProviderConfig(PROVIDER, "glm-codeplan");
  });

  it("text: sends a text message and receives a response", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "Reply with exactly: pong" },
    ];
    const result = await invokeEngineForSmoke(GLMCodePlanEngine, config, messages, []);
    if (result === null) {
      return;
    }
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.content).toBeTruthy();
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
    const result = await invokeEngineForSmoke(GLMCodePlanEngine, config, messages, []);
    if (result === null) {
      return;
    }
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.content).toBeTruthy();
      log("Response content:", result.content);
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
    const result = await invokeEngineForSmoke(GLMCodePlanEngine, config, messages, [tool]);
    if (result === null) {
      return;
    }
    expect(isToolCallResponse(result)).toBe(true);
    if (isToolCallResponse(result)) {
      expect(result).toHaveLength(1);
      expect(result[0]!.toolName).toBe("get_weather");
      expect(result[0]!.arguments).toHaveProperty("city");
      log("Tool call:", result[0]);
      return;
    }

    fail("Expected a ToolCallMessage response");
  }, 20000);

  it("thinking: sends request with thinking enabled", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "What is 2+2? Reply with just the number." },
    ];
    const thinkConfig = { ...config, thinking: true };
    const result = await invokeEngineForSmoke(GLMCodePlanEngine, thinkConfig, messages, []);
    if (result === null) {
      return;
    }
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.content).toBeTruthy();
      expect(result.reasoningContent).toBeDefined();
      log("Thinking response content:", result.reasoningContent);
      log("Response content:", result.content);
      return;
    }

    fail("Expected an AssistMessage response");
  }, 20000);

  it("thinking: sends request with thinking disabled (default)", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "What is 3+3? Reply with just the number." },
    ];
    const noThinkConfig = { ...config, thinking: false };
    const result = await invokeEngineForSmoke(GLMCodePlanEngine, noThinkConfig, messages, []);
    if (result === null) {
      return;
    }
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.content).toBeTruthy();
      expect(result.reasoningContent).toBeUndefined();
      log("Response content:", result.content);
      return;
    }

    fail("Expected an AssistMessage response");
  }, 20000);
});

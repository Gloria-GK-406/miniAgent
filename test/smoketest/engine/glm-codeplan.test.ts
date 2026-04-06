import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { createGLMCodePlanEngine } from "../../../src/engine/glm-codeplan/index.js";
import { MessageType } from "../../../src/core/types.js";
import type { Message, Tool } from "../../../src/core/types.js";
import type { ModelConfig } from "../../../src/core/config.js";
import {
  getProviderConfig,
  isProviderConfigured,
} from "../helpers.js";
import { getTestImageBase64 } from "../image.js";
import { debug, log } from "node:console";
import { fail } from "node:assert";

const PROVIDER = "GLM_CODEPLAN" as const;

describe.skipIf(!isProviderConfigured(PROVIDER))("GLM CodePlan Engine", () => {
  let config: ModelConfig;
  const engine = createGLMCodePlanEngine();

  beforeAll(() => {
    config = getProviderConfig(PROVIDER, "glm-codeplan");
  });

  it("text: sends a text message and receives a response", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "Reply with exactly: pong" },
    ];
    const result = await engine.generate(messages, config, []);
    expect(result.type).toBe(MessageType.Assist);
    if (result.type === MessageType.Assist) {
      expect(result.content).toBeTruthy();
      log("Thinking response content:", result.reasoningContent);
      log("Response content:", result.content);
      return;
    }

    fail("Expected an AssistMessage response");
  });

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
    const result = await engine.generate(messages, config, []);
    expect(result.type).toBe(MessageType.Assist);
    if (result.type === MessageType.Assist) {
      expect(result.content).toBeTruthy();
    }
  });

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
    const result = await engine.generate(messages, config, [tool]);
    expect(result.type).toBe(MessageType.ToolCall);
    if (result.type === MessageType.ToolCall) {
      expect(result.toolName).toBe("get_weather");
      expect(result.arguments).toHaveProperty("city");
      return;
    }

    fail("Expected a ToolCallMessage response");
  });

  it("thinking: sends request with thinking enabled", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "What is 2+2? Reply with just the number." },
    ];
    const thinkConfig = { ...config, thinking: true };
    const result = await engine.generate(messages, thinkConfig, []);
    expect(result.type).toBe(MessageType.Assist);
    if (result.type === MessageType.Assist) {
      expect(result.content).toBeTruthy();
      expect(result.reasoningContent).toBeDefined();
      log("Thinking response content:", result.reasoningContent);
      log("Response content:", result.content);
      return;
    }

    fail("Expected an AssistMessage response");
  });

  it("thinking: sends request with thinking disabled (default)", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "What is 3+3? Reply with just the number." },
    ];
    const noThinkConfig = { ...config, thinking: false };
    const result = await engine.generate(messages, noThinkConfig, []);
    expect(result.type).toBe(MessageType.Assist);
    if (result.type === MessageType.Assist) {
      expect(result.content).toBeTruthy();
      expect(result.reasoningContent).toBeUndefined();
      log("Response content:", result.content);
      return;
    }

    fail("Expected an AssistMessage response");
  });
});

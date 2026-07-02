import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { OpenAICompatibleEngine } from "../../../src/engine/openai-compatible/index.js";
import { MessageType } from "../../../src/core/types.js";
import type { Message, Tool } from "../../../src/core/types.js";
import { ThinkingLevel, type ModelProviderConfig } from "../../../src/core/config.js";
import {
  getProviderConfig,
  getProviderModel,
  isProviderConfigured,
  invokeEngine,
  isAssistResponse,
  isToolCallResponse,
  requireEnv,
} from "../helpers.js";
import { getTestImageBase64 } from "../image.js";

const PROVIDER = "OPENAI_COMPATIBLE" as const;
const engine = new OpenAICompatibleEngine();

describe.skipIf(!isProviderConfigured(PROVIDER))("OpenAI-Compatible Engine", () => {
  let providerConfig: ModelProviderConfig;
  let providerModel: string;

  beforeAll(() => {
    providerConfig = getProviderConfig(
      PROVIDER,
      "openai-compatible",
      requireEnv("PROVIDER_OPENAI_COMPATIBLE_BASE_URL"),
    );
    providerModel = getProviderModel(PROVIDER);
  });

  it("text: sends a text message and receives a response", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "Reply with exactly: pong" },
    ];
    const result = await invokeEngine(engine, providerConfig, providerModel, messages, []);
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.message.content).toBeTruthy();
    }
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
    const result = await invokeEngine(engine, providerConfig, providerModel, messages, []);
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.message.content).toBeTruthy();
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
    const result = await invokeEngine(engine, providerConfig, providerModel, messages, [tool]);
    expect(isToolCallResponse(result)).toBe(true);
    if (isToolCallResponse(result)) {
      expect(result.message).toHaveLength(1);
      expect(result.message[0]!.toolName).toBe("get_weather");
      expect(result.message[0]!.arguments).toHaveProperty("city");
    }
  });

  it("thinking: sends request with thinking enabled", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "What is 2+2? Reply with just the number." },
    ];
    const result = await invokeEngine(engine, providerConfig, providerModel, messages, [], {
      generation: { thinking: ThinkingLevel.Medium },
    });
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.message.content).toBeTruthy();
    }
  });

  it("thinking: sends request with thinking disabled", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "What is 3+3? Reply with just the number." },
    ];
    const result = await invokeEngine(engine, providerConfig, providerModel, messages, [], {
      generation: { thinking: ThinkingLevel.None },
    });
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.message.content).toBeTruthy();
    }
  });
});

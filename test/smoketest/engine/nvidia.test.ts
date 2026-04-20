import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { NVIDIAEngine } from "../../../src/engine/nvidia/index.js";
import { MessageType, LLMStreamChunkType } from "../../../src/core/types.js";
import type { Message, Tool, LLMStreamChunk } from "../../../src/core/types.js";
import type { ModelConfig } from "../../../src/core/config.js";
import {
  getProviderConfig,
  isProviderConfigured,
  invokeEngineForSmoke,
  isAssistResponse,
  isToolCallResponse,
} from "../helpers.js";

const PROVIDER = "NVIDIA" as const;

describe.skipIf(!isProviderConfigured(PROVIDER))("NVIDIA Engine", () => {
  let config: ModelConfig;

  beforeAll(() => {
    config = getProviderConfig(PROVIDER, "nvidia");
  });

  it("text: sends a text message and receives a response", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "Reply with exactly: pong" },
    ];
    const result = await invokeEngineForSmoke(NVIDIAEngine, config, messages, []);
    if (result === null) {
      return;
    }
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.message.content).toBeTruthy();
    }
  }, 300000);

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
    const result = await invokeEngineForSmoke(NVIDIAEngine, config, messages, [tool]);
    if (result === null) {
      return;
    }
    expect(isToolCallResponse(result)).toBe(true);
    if (isToolCallResponse(result)) {
      expect(result.message).toHaveLength(1);
      expect(result.message[0]!.toolName).toBe("get_weather");
      expect(result.message[0]!.arguments).toHaveProperty("city");
    }
  }, 30000);

  it("thinking: separates <think> block from content when present", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "What is 15 * 37? Think step by step, then give the answer." },
    ];
    const result = await invokeEngineForSmoke(NVIDIAEngine, config, messages, []);
    if (result === null) {
      return;
    }
    expect(isAssistResponse(result)).toBe(true);
    if (isAssistResponse(result)) {
      expect(result.message.content).toBeTruthy();
      if (result.message.reasoningContent !== undefined) {
        expect(result.message.reasoningContent).toBeTruthy();
        expect(result.message.content).not.toContain("<think>");
        expect(result.message.content).not.toContain("</think>");
      }
    }
  }, 30000);

  it("stream: emits chunks during streaming", async () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "Count from 1 to 5, one number per line." },
    ];
    const chunks: LLMStreamChunk[] = [];
    const engine = new NVIDIAEngine(config);
    const handle = engine.streamGenerate(messages, []);
    handle.onChunk((chunk) => {
      chunks.push(chunk);
    });
    const result = await handle;
    if (result === null) {
      return;
    }
    expect(isAssistResponse(result)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    const textChunks = chunks.filter((c) => c.type === LLMStreamChunkType.TextDelta);
    expect(textChunks.length).toBeGreaterThan(0);
  }, 30000);
});

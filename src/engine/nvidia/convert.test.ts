import { describe, it, expect } from "vitest";
import { MessageType } from "../../core/types.js";
import {
  convertMessages,
  buildCreateParams,
  convertResponse,
} from "../openai-compatible/convert.js";
import type { Message, Tool } from "../../core/types.js";
import type { ModelConfig } from "../../core/config.js";
import { z } from "zod";

function sysMsg(content: string): Message {
  return { id: "sys-1", type: MessageType.System, content };
}

function userMsg(content: string): Message {
  return { id: "user-1", type: MessageType.User, content };
}

function assistMsg(content: string): Message {
  return { id: "assist-1", type: MessageType.Assist, content };
}

function toolCallMsg(
  overrides: Partial<{
    content: string;
    toolCallId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  }> = {},
): Message {
  return {
    id: "tc-1",
    type: MessageType.ToolCall,
    content: overrides.content ?? "",
    toolCallId: overrides.toolCallId ?? "call_abc",
    toolName: overrides.toolName ?? "get_weather",
    arguments: overrides.arguments ?? { city: "Beijing" },
  };
}

function toolResultMsg(
  overrides: Partial<{ content: string; toolCallId: string }> = {},
): Message {
  return {
    id: "tr-1",
    type: MessageType.ToolResult,
    content: overrides.content ?? "sunny, 25\u00B0C",
    toolCallId: overrides.toolCallId ?? "call_abc",
  };
}

const baseConfig: ModelConfig = {
  provider: "nvidia",
  model: "meta/llama-3.3-70b-instruct",
  apiKey: "nvapi-test-key",
  baseUrl: "",
};

describe("NVIDIA convertMessages", () => {
  it("converts system message", () => {
    const result = convertMessages([sysMsg("You are helpful")]);
    expect(result).toEqual([{ role: "system", content: "You are helpful" }]);
  });

  it("converts user message", () => {
    const result = convertMessages([userMsg("Hello")]);
    expect(result).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("converts assistant message", () => {
    const result = convertMessages([assistMsg("Hi there")]);
    expect(result).toEqual([{ role: "assistant", content: "Hi there" }]);
  });

  it("converts tool call message", () => {
    const result = convertMessages([toolCallMsg()]);
    expect(result).toHaveLength(1);
    const msg = result[0]!;
    expect(msg).toMatchObject({
      role: "assistant",
      content: null,
    });
    expect(msg).toHaveProperty("tool_calls");
  });

  it("converts tool result message", () => {
    const result = convertMessages([toolResultMsg()]);
    expect(result).toEqual([{
      role: "tool",
      tool_call_id: "call_abc",
      content: "sunny, 25\u00B0C",
    }]);
  });

  it("converts full conversation round-trip", () => {
    const messages: Message[] = [
      sysMsg("Be helpful"),
      userMsg("What's the weather?"),
      toolCallMsg(),
      toolResultMsg(),
      assistMsg("It's sunny in Beijing."),
    ];
    const result = convertMessages(messages);
    expect(result).toHaveLength(5);
    expect(result[0]).toMatchObject({ role: "system" });
    expect(result[1]).toMatchObject({ role: "user" });
    expect(result[2]).toMatchObject({ role: "assistant" });
    expect(result[3]).toMatchObject({ role: "tool" });
    expect(result[4]).toMatchObject({ role: "assistant" });
  });
});

describe("NVIDIA buildCreateParams", () => {
  it("builds basic params with model and messages", () => {
    const params = buildCreateParams([userMsg("hi")], baseConfig, []);
    expect(params).toMatchObject({
      model: "meta/llama-3.3-70b-instruct",
    });
    expect(params.messages).toHaveLength(1);
  });

  it("includes max_tokens when configured", () => {
    const config: ModelConfig = { ...baseConfig, maxTokens: 4096 };
    const params = buildCreateParams([userMsg("hi")], config, []);
    expect(params).toMatchObject({ max_tokens: 4096 });
  });

  it("includes temperature when configured", () => {
    const config: ModelConfig = { ...baseConfig, temperature: 0.7 };
    const params = buildCreateParams([userMsg("hi")], config, []);
    expect(params).toMatchObject({ temperature: 0.7 });
  });

  it("includes topP when configured", () => {
    const config: ModelConfig = { ...baseConfig, topP: 0.9 };
    const params = buildCreateParams([userMsg("hi")], config, []);
    expect(params).toMatchObject({ top_p: 0.9 });
  });

  it("omits optional params when not configured", () => {
    const params = buildCreateParams([userMsg("hi")], baseConfig, []);
    expect(params).not.toHaveProperty("max_tokens");
    expect(params).not.toHaveProperty("temperature");
    expect(params).not.toHaveProperty("top_p");
  });

  it("converts tools correctly", () => {
    const tool: Tool = {
      name: "get_weather",
      description: "Get weather for a city",
      parameters: z.object({ city: z.string().describe("City name") }),
      execute: async () => "sunny",
    };
    const params = buildCreateParams([userMsg("hi")], baseConfig, [tool]);
    expect(params.tools).toHaveLength(1);
    expect(params.tools![0]).toMatchObject({
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather for a city",
      },
    });
  });
});

describe("NVIDIA convertResponse", () => {
  it("converts text response", () => {
    const response = {
      id: "chatcmpl-1",
      choices: [
        {
          message: {
            role: "assistant" as const,
            content: "Hello!",
          },
          finish_reason: "stop",
          index: 0,
        },
      ],
      created: 0,
      model: "meta/llama-3.3-70b-instruct",
      object: "chat.completion" as const,
    };

    const result = convertResponse(response as never);
    expect(!Array.isArray(result.message)).toBe(true);
    if (!Array.isArray(result.message)) {
      expect(result.message.type).toBe(MessageType.Assist);
      expect(result.message.content).toBe("Hello!");
    }
  });

  it("converts tool call response", () => {
    const response = {
      id: "chatcmpl-2",
      choices: [
        {
          message: {
            role: "assistant" as const,
            content: null,
            tool_calls: [
              {
                id: "call_xyz",
                type: "function" as const,
                function: {
                  name: "search",
                  arguments: '{"query":"test"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
          index: 0,
        },
      ],
      created: 0,
      model: "meta/llama-3.3-70b-instruct",
      object: "chat.completion" as const,
    };

    const result = convertResponse(response as never);
    expect(Array.isArray(result.message)).toBe(true);
    const toolCalls = result.message as Array<{ type: MessageType; toolCallId: string }>;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.type).toBe(MessageType.ToolCall);
    expect(toolCalls[0]!.toolCallId).toBe("call_xyz");
  });
});

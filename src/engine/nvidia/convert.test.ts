import { describe, it, expect } from "vitest";
import { MessageType } from "../../core/index.js";
import {
  convertMessages,
  buildCreateParamsFromRequest,
  convertResponse,
} from "../openai-compatible/convert.js";
import type { Message, Tool } from "../../core/index.js";
import {
  ThinkingLevel,
  type LLMGenerateRequest,
} from "../../core/index.js";
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

function makeTool(): Tool {
  return {
    name: "get_weather",
    description: "Get weather for a city",
    parameters: z.object({ city: z.string().describe("City name") }),
    execute: async () => "sunny",
  };
}

function request(
  overrides: Partial<{
    thinking: ThinkingLevel;
    thinkingLevels: ThinkingLevel[];
    tools: Tool[];
    maxOutputTokens: number;
    topP: number;
  }> = {},
): LLMGenerateRequest {
  return {
    messages: [userMsg("hi")],
    tools: overrides.tools ?? [],
    runtime: {
      provider: "nvidia",
      key: "nvapi-test-key",
      model: {
      name: "meta/llama-3.3-70b-instruct",
      thinkingLevels: overrides.thinkingLevels ?? [ThinkingLevel.None],
      },
    },
    generation: {
      temperature: 0.7,
      ...(overrides.topP !== undefined && { topP: overrides.topP }),
      ...(overrides.maxOutputTokens !== undefined && {
        maxOutputTokens: overrides.maxOutputTokens,
      }),
      thinking: overrides.thinking ?? ThinkingLevel.None,
    },
  };
}

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

describe("NVIDIA buildCreateParamsFromRequest", () => {
  it("builds request-mode params with generation fields", () => {
    const params = buildCreateParamsFromRequest(request({
      maxOutputTokens: 4096,
      topP: 0.9,
    }));

    expect(params).toMatchObject({
      model: "meta/llama-3.3-70b-instruct",
      max_completion_tokens: 4096,
      temperature: 0.7,
      top_p: 0.9,
    });
    expect(params.messages).toHaveLength(1);
  });

  it("converts tools correctly", () => {
    const params = buildCreateParamsFromRequest(request({
      tools: [makeTool()],
    }));
    expect(params.tools).toHaveLength(1);
    expect(params.tools![0]).toMatchObject({
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather for a city",
      },
    });
  });

  it("silently omits thinking params for NVIDIA", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.High,
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.High],
    }));

    expect(params).not.toHaveProperty("reasoning_effort");
    expect(params).not.toHaveProperty("thinking");
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

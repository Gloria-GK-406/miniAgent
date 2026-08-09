import { describe, it, expect } from "vitest";
import { z } from "zod";
import { MessageType } from "../../core/index.js";
import {
  convertMessages,
  convertTools,
  buildCreateParamsFromRequest,
  convertResponse,
} from "./convert.js";
import type { Message, Tool, ImageContent } from "../../core/index.js";
import {
  ThinkingLevel,
  type LLMGenerateRequest,
} from "../../core/index.js";

function sysMsg(content: string): Message {
  return { id: "sys-1", type: MessageType.System, content };
}

function userMsg(content: string): Message {
  return { id: "user-1", type: MessageType.User, content };
}

function userImageMsg(
  overrides: Partial<{ mediaType: string; data: string }> = {},
): Message {
  return {
    id: "user-img-1",
    type: MessageType.User,
    content: {
      type: "image",
      mediaType: overrides.mediaType ?? "image/png",
      data: overrides.data ?? "iVBORw0KGgo=",
    } satisfies ImageContent,
  };
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
  overrides: Partial<{
    content: string;
    toolCallId: string;
  }> = {},
): Message {
  return {
    id: "tr-1",
    type: MessageType.ToolResult,
    content: overrides.content ?? "sunny, 25\u00B0C",
    toolCallId: overrides.toolCallId ?? "call_abc",
  };
}

function request(
  overrides: Partial<{
    provider: string;
    model: string;
    thinking: ThinkingLevel;
    thinkingLevels: ThinkingLevel[];
    tools: Tool[];
    maxOutputTokens: number;
    topP: number;
  }> = {},
): LLMGenerateRequest {
  const provider = overrides.provider ?? "openai";
  const model = overrides.model ?? "o3";
  return {
    messages: [userMsg("hi")],
    tools: overrides.tools ?? [],
    runtime: {
      provider,
      key: "test-key",
      baseUrl: "https://example.invalid/v1",
      model: {
        name: model,
        thinkingLevels: overrides.thinkingLevels ?? [
          ThinkingLevel.None,
          ThinkingLevel.Low,
          ThinkingLevel.Medium,
          ThinkingLevel.High,
        ],
      },
    },
    generation: {
      temperature: 0.7,
      ...(overrides.topP !== undefined && { topP: overrides.topP }),
      ...(overrides.maxOutputTokens !== undefined && {
        maxOutputTokens: overrides.maxOutputTokens,
      }),
      thinking: overrides.thinking ?? ThinkingLevel.High,
    },
  };
}

function makeTool(
  overrides: Partial<{ name: string; description: string }> = {},
): Tool {
  return {
    name: overrides.name ?? "get_weather",
    description: overrides.description ?? "Get weather for a city",
    parameters: z.object({
      city: z.string().describe("City name"),
    }),
    execute: async () => "ok",
  };
}

describe("convertMessages", () => {
  it("converts SystemMessage to system role", () => {
    const result = convertMessages([sysMsg("You are helpful.")]);
    expect(result).toEqual([{ role: "system", content: "You are helpful." }]);
  });

  it("converts UserMessage to user role", () => {
    const result = convertMessages([userMsg("Hello")]);
    expect(result).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("converts UserMessage with image content to image_url content block", () => {
    const result = convertMessages([userImageMsg()]);
    expect(result).toHaveLength(1);
    const msg = result[0]!;
    expect(msg.role).toBe("user");
    const content = (msg as { content: Array<{ type: string; image_url: { url: string } }> }).content;
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({
      type: "image_url",
      image_url: {
        url: "data:image/png;base64,iVBORw0KGgo=",
      },
    });
  });

  it("converts UserMessage with image and custom mediaType", () => {
    const result = convertMessages([userImageMsg({ mediaType: "image/jpeg" })]);
    const msg = result[0]!;
    const content = (msg as { content: Array<{ image_url: { url: string } }> }).content;
    expect(content[0]!.image_url.url).toBe("data:image/jpeg;base64,iVBORw0KGgo=");
  });

  it("converts AssistMessage to assistant role", () => {
    const result = convertMessages([assistMsg("Hi there")]);
    expect(result).toEqual([{ role: "assistant", content: "Hi there" }]);
  });

  it("converts ToolCallMessage to assistant with tool_calls", () => {
    const result = convertMessages([toolCallMsg()]);
    expect(result).toHaveLength(1);
    const msg = result[0]!;
    expect(msg).toMatchObject({
      role: "assistant",
      content: null,
    });
    expect(msg).toHaveProperty("tool_calls");
    const tc = (msg as { tool_calls: unknown[] }).tool_calls;
    expect(tc).toHaveLength(1);
    expect(tc[0]).toEqual({
      id: "call_abc",
      type: "function",
      function: {
        name: "get_weather",
        arguments: '{"city":"Beijing"}',
      },
    });
  });

  it("converts ToolResultMessage to tool role", () => {
    const result = convertMessages([toolResultMsg()]);
    expect(result).toEqual([
      {
        role: "tool",
        tool_call_id: "call_abc",
        content: "sunny, 25\u00B0C",
      },
    ]);
  });

  it("converts a full conversation", () => {
    const messages: Message[] = [
      sysMsg("Be helpful"),
      userMsg("What's the weather?"),
      toolCallMsg(),
      toolResultMsg(),
      assistMsg("It's sunny in Beijing."),
    ];
    const result = convertMessages(messages);
    expect(result).toHaveLength(5);
    expect(result[0]!.role).toBe("system");
    expect(result[1]!.role).toBe("user");
    expect(result[2]!.role).toBe("assistant");
    expect(result[3]!.role).toBe("tool");
    expect(result[4]!.role).toBe("assistant");
  });
});

describe("convertTools", () => {
  it("returns empty array for no tools", () => {
    expect(convertTools([])).toEqual([]);
  });

  it("converts Tool with Zod schema to function tool", () => {
    const result = convertTools([makeTool()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "function",
      function: {
        name: "get_weather",
        description: "Get weather for a city",
        parameters: {
          type: "object",
          properties: {
            city: { type: "string", description: "City name" },
          },
          required: ["city"],
          additionalProperties: false,
        },
      },
    });
  });

  it("converts multiple tools", () => {
    const tools = [
      makeTool({ name: "tool_a", description: "Tool A" }),
      makeTool({ name: "tool_b", description: "Tool B" }),
    ];
    const result = convertTools(tools);
    expect(result).toHaveLength(2);
    expect((result[0] as { function: { name: string } }).function.name).toBe("tool_a");
    expect((result[1] as { function: { name: string } }).function.name).toBe("tool_b");
  });
});

describe("buildCreateParamsFromRequest", () => {
  it("builds params from request model, messages, and generation", () => {
    const params = buildCreateParamsFromRequest(request({
      model: "gpt-4o",
      maxOutputTokens: 200,
      topP: 0.9,
      thinking: ThinkingLevel.None,
    }));

    expect(params).toMatchObject({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      max_completion_tokens: 200,
      temperature: 0.7,
      top_p: 0.9,
    });
    expect(params).not.toHaveProperty("max_tokens");
  });

  it("includes tools when provided", () => {
    const params = buildCreateParamsFromRequest(request({
      tools: [makeTool()],
      thinking: ThinkingLevel.None,
    }));
    expect(params.tools).toHaveLength(1);
  });

  it("omits reasoning_effort when request thinking is none", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.None,
    }));

    expect(params).not.toHaveProperty("reasoning_effort");
  });

  it("downgrades unsupported OpenAI reasoning effort to nearest supported lower level", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.Max,
    }));

    expect(params).toMatchObject({ reasoning_effort: "high" });
  });

  it("omits reasoning_effort instead of upgrading low to medium", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.Low,
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
    }));

    expect(params).not.toHaveProperty("reasoning_effort");
  });

  it("omits reasoning_effort when no non-none level is supported", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.High,
      thinkingLevels: [ThinkingLevel.None],
    }));

    expect(params).not.toHaveProperty("reasoning_effort");
  });

  it("omits reasoning_effort for non-OpenAI providers", () => {
    const params = buildCreateParamsFromRequest(request({
      provider: "openai-compatible",
      thinking: ThinkingLevel.High,
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.High],
    }));

    expect(params).not.toHaveProperty("reasoning_effort");
  });
});

describe("convertResponse", () => {
  it("converts text response to AssistMessage", () => {
    const response = {
      id: "chatcmpl-1",
      choices: [
        {
          message: { role: "assistant" as const, content: "Hello!" },
          finish_reason: "stop",
          index: 0,
        },
      ],
      created: 0,
      model: "gpt-4o",
      object: "chat.completion" as const,
    };

    const result = convertResponse(response as never);
    expect(!Array.isArray(result.message)).toBe(true);
    if (!Array.isArray(result.message)) {
      expect(result.message.type).toBe(MessageType.Assist);
      expect(result.message.content).toBe("Hello!");
      expect(result.message.id).toBeTruthy();
    }
    expect(result.tokenCount).toEqual({ input: 0, output: 0, total: 0 });
  });

  it("converts tool call response to ToolCallMessage array", () => {
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
      model: "gpt-4o",
      object: "chat.completion" as const,
    };

    const result = convertResponse(response as never);
    expect(Array.isArray(result.message)).toBe(true);
    const toolCalls = result.message as Array<{ type: MessageType; toolCallId: string; toolName: string; arguments: Record<string, unknown> }>;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.type).toBe(MessageType.ToolCall);
    expect(toolCalls[0]!.toolCallId).toBe("call_xyz");
    expect(toolCalls[0]!.toolName).toBe("search");
    expect(toolCalls[0]!.arguments).toEqual({ query: "test" });
  });

  it("converts multiple tool calls response to ToolCallMessage array", () => {
    const response = {
      id: "chatcmpl-4",
      choices: [
        {
          message: {
            role: "assistant" as const,
            content: null,
            tool_calls: [
              {
                id: "call_a",
                type: "function" as const,
                function: {
                  name: "search",
                  arguments: '{"query":"first"}',
                },
              },
              {
                id: "call_b",
                type: "function" as const,
                function: {
                  name: "search",
                  arguments: '{"query":"second"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
          index: 0,
        },
      ],
      created: 0,
      model: "gpt-4o",
      object: "chat.completion" as const,
    };

    const result = convertResponse(response as never);
    expect(Array.isArray(result.message)).toBe(true);
    const toolCalls = result.message as Array<{ type: MessageType; toolCallId: string; toolName: string; arguments: Record<string, unknown> }>;
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]!.toolCallId).toBe("call_a");
    expect(toolCalls[0]!.arguments).toEqual({ query: "first" });
    expect(toolCalls[1]!.toolCallId).toBe("call_b");
    expect(toolCalls[1]!.arguments).toEqual({ query: "second" });
  });

  it("throws when choices is empty", () => {
    const response = {
      id: "chatcmpl-3",
      choices: [],
      created: 0,
      model: "gpt-4o",
      object: "chat.completion" as const,
    };

    expect(() => convertResponse(response as never)).toThrow(
      "No choices in OpenAI response",
    );
  });
});

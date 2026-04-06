import { describe, it, expect } from "vitest";
import { z } from "zod";
import { MessageType } from "../../core/types.js";
import {
  convertMessages,
  convertTools,
  buildCreateParams,
  convertResponse,
} from "./convert.js";
import type { Message, Tool, ImageContent } from "../../core/types.js";
import type { ModelConfig } from "../../core/config.js";

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

const baseConfig: ModelConfig = {
  provider: "openai",
  model: "gpt-4o",
  apiKey: "test-key",
  baseUrl: "",
};

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

describe("buildCreateParams", () => {
  it("builds params with required fields only", () => {
    const params = buildCreateParams([userMsg("hi")], baseConfig, []);
    expect(params).toEqual({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
    });
  });

  it("passes optional ModelConfig fields", () => {
    const config: ModelConfig = {
      ...baseConfig,
      maxTokens: 100,
      maxOutputTokens: 200,
      temperature: 0.7,
      topP: 0.9,
    };
    const params = buildCreateParams([userMsg("hi")], config, []);
    expect(params).toMatchObject({
      max_tokens: 100,
      max_completion_tokens: 200,
      temperature: 0.7,
      top_p: 0.9,
    });
  });

  it("includes tools when provided", () => {
    const params = buildCreateParams(
      [userMsg("hi")],
      baseConfig,
      [makeTool()],
    );
    expect(params.tools).toHaveLength(1);
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
    expect(!Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) {
      expect(result.type).toBe(MessageType.Assist);
      expect(result.content).toBe("Hello!");
      expect(result.id).toBeTruthy();
    }
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
    expect(Array.isArray(result)).toBe(true);
    const toolCalls = result as Array<{ type: MessageType; toolCallId: string; toolName: string; arguments: Record<string, unknown> }>;
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
    expect(Array.isArray(result)).toBe(true);
    const toolCalls = result as Array<{ type: MessageType; toolCallId: string; toolName: string; arguments: Record<string, unknown> }>;
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

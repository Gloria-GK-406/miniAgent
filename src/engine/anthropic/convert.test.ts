import { describe, it, expect } from "vitest";
import { z } from "zod";
import { MessageType } from "../../core/types.js";
import {
  convertMessages,
  convertTools,
  buildCreateParams,
  convertResponse,
} from "./convert.js";
import type { Message, Tool } from "../../core/types.js";
import type { ModelConfig } from "../../core/config.js";

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
    toolCallId: overrides.toolCallId ?? "toolu_abc",
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
    content: overrides.content ?? "sunny, 25°C",
    toolCallId: overrides.toolCallId ?? "toolu_abc",
  };
}

const baseConfig: ModelConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-5-20250929",
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
  it("extracts SystemMessage into system field", () => {
    const result = convertMessages([sysMsg("Be helpful")]);
    expect(result.system).toBe("Be helpful");
    expect(result.messages).toEqual([]);
  });

  it("joins multiple SystemMessages with double newline", () => {
    const result = convertMessages([sysMsg("A"), sysMsg("B")]);
    expect(result.system).toBe("A\n\nB");
  });

  it("does not set system when no SystemMessage present", () => {
    const result = convertMessages([userMsg("hi")]);
    expect(result.system).toBeUndefined();
  });

  it("converts UserMessage to user role with string content", () => {
    const result = convertMessages([userMsg("Hello")]);
    expect(result.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("converts AssistMessage to assistant role with text block", () => {
    const result = convertMessages([assistMsg("Hi there")]);
    expect(result.messages).toEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "Hi there" }],
      },
    ]);
  });

  it("converts ToolCallMessage to assistant with tool_use block", () => {
    const result = convertMessages([toolCallMsg()]);
    expect(result.messages).toHaveLength(1);
    const msg = result.messages[0]!;
    expect(msg.role).toBe("assistant");
    const content = msg.content as Array<{ type: string }>;
    const toolUse = content.find((b) => b.type === "tool_use");
    expect(toolUse).toMatchObject({
      type: "tool_use",
      id: "toolu_abc",
      name: "get_weather",
      input: { city: "Beijing" },
    });
  });

  it("converts ToolResultMessage to user with tool_result block", () => {
    const result = convertMessages([toolResultMsg()]);
    expect(result.messages).toHaveLength(1);
    const msg = result.messages[0]!;
    expect(msg.role).toBe("user");
    const content = msg.content as Array<{ type: string; tool_use_id: string; content: string }>;
    expect(content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "toolu_abc",
      content: "sunny, 25°C",
    });
  });

  it("merges consecutive ToolResult user messages into one", () => {
    const messages: Message[] = [
      toolCallMsg({ toolCallId: "call_1" }),
      toolResultMsg({ toolCallId: "call_1", content: "result 1" }),
      toolCallMsg({ toolCallId: "call_2" }),
      toolResultMsg({ toolCallId: "call_2", content: "result 2" }),
    ];
    const result = convertMessages(messages);
    const userMessages = result.messages.filter((m) => m.role === "user");
    expect(userMessages).toHaveLength(2);
    const firstUser = userMessages[0]!;
    const blocks = firstUser.content as Array<{ type: string }>;
    expect(blocks).toHaveLength(1);
    const secondUser = userMessages[1]!;
    const blocks2 = secondUser.content as Array<{ type: string }>;
    expect(blocks2).toHaveLength(1);
  });

  it("does not merge non-consecutive user messages", () => {
    const messages: Message[] = [
      userMsg("first"),
      assistMsg("ok"),
      userMsg("second"),
    ];
    const result = convertMessages(messages);
    expect(result.messages).toHaveLength(3);
  });
});

describe("convertTools", () => {
  it("returns empty array for no tools", () => {
    expect(convertTools([])).toEqual([]);
  });

  it("converts Tool to Anthropic tool format", () => {
    const result = convertTools([makeTool()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "get_weather",
      description: "Get weather for a city",
      input_schema: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name" },
        },
        required: ["city"],
      },
    });
  });
});

describe("buildCreateParams", () => {
  it("builds params with defaults", () => {
    const params = buildCreateParams([userMsg("hi")], baseConfig, []);
    expect(params.model).toBe("claude-sonnet-4-5-20250929");
    expect(params.max_tokens).toBe(4096);
    expect(params.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("prefers maxTokens over maxOutputTokens", () => {
    const config: ModelConfig = {
      ...baseConfig,
      maxTokens: 100,
      maxOutputTokens: 200,
    };
    const params = buildCreateParams([userMsg("hi")], config, []);
    expect(params.max_tokens).toBe(100);
  });

  it("uses maxOutputTokens when maxTokens is absent", () => {
    const config: ModelConfig = { ...baseConfig, maxOutputTokens: 200 };
    const params = buildCreateParams([userMsg("hi")], config, []);
    expect(params.max_tokens).toBe(200);
  });

  it("sets system when SystemMessage present", () => {
    const params = buildCreateParams(
      [sysMsg("Be helpful"), userMsg("hi")],
      baseConfig,
      [],
    );
    expect(params.system).toBe("Be helpful");
  });

  it("includes tools and optional fields", () => {
    const config: ModelConfig = {
      ...baseConfig,
      temperature: 0.5,
      topP: 0.8,
    };
    const params = buildCreateParams([userMsg("hi")], config, [makeTool()]);
    expect(params.tools).toHaveLength(1);
    expect(params.temperature).toBe(0.5);
    expect(params.top_p).toBe(0.8);
  });
});

describe("convertResponse", () => {
  it("converts text-only response to AssistMessage", () => {
    const response = {
      id: "msg_1",
      type: "message" as const,
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "Hello!", citations: null }],
      model: "claude-sonnet-4-5-20250929",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        cache_creation: null,
        inference_geo: null,
        server_tool_use: null,
      },
      container: null,
      stop_details: null,
    };

    const result = convertResponse(response as never);
    expect(result.type).toBe(MessageType.Assist);
    if (result.type === MessageType.Assist) {
      expect(result.content).toBe("Hello!");
    }
  });

  it("converts tool_use response to ToolCallMessage", () => {
    const response = {
      id: "msg_2",
      type: "message" as const,
      role: "assistant" as const,
      content: [
        { type: "text" as const, text: "Let me check.", citations: null },
        {
          type: "tool_use" as const,
          id: "toolu_xyz",
          name: "search",
          input: { query: "test" },
          caller: { type: "direct" as const },
        },
      ],
      model: "claude-sonnet-4-5-20250929",
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        cache_creation: null,
        inference_geo: null,
        server_tool_use: null,
      },
      container: null,
      stop_details: null,
    };

    const result = convertResponse(response as never);
    expect(result.type).toBe(MessageType.ToolCall);
    if (result.type === MessageType.ToolCall) {
      expect(result.content).toBe("Let me check.");
      expect(result.toolCallId).toBe("toolu_xyz");
      expect(result.toolName).toBe("search");
      expect(result.arguments).toEqual({ query: "test" });
    }
  });

  it("converts tool_use without text to ToolCallMessage with empty content", () => {
    const response = {
      id: "msg_3",
      type: "message" as const,
      role: "assistant" as const,
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_123",
          name: "run",
          input: { cmd: "ls" },
          caller: { type: "direct" as const },
        },
      ],
      model: "claude-sonnet-4-5-20250929",
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: {
        input_tokens: 5,
        output_tokens: 10,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        cache_creation: null,
        inference_geo: null,
        server_tool_use: null,
      },
      container: null,
      stop_details: null,
    };

    const result = convertResponse(response as never);
    expect(result.type).toBe(MessageType.ToolCall);
    if (result.type === MessageType.ToolCall) {
      expect(result.content).toBe("");
      expect(result.toolCallId).toBe("toolu_123");
    }
  });
});

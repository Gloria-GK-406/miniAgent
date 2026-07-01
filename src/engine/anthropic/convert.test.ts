import { describe, it, expect } from "vitest";
import { z } from "zod";
import { MessageType } from "../../core/types.js";
import {
  convertMessages,
  convertTools,
  buildCreateParams,
  buildCreateParamsFromRequest,
  convertResponse,
} from "./convert.js";
import type { Message, Tool, ImageContent } from "../../core/types.js";
import {
  ThinkingLevel,
  type LLMGenerateRequest,
  type ModelConfig,
} from "../../core/config.js";

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
    content: overrides.content ?? "sunny, 25\u00B0C",
    toolCallId: overrides.toolCallId ?? "toolu_abc",
  };
}

const baseConfig: ModelConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-5-20250929",
  apiKey: "test-key",
  baseUrl: "",
};

function request(
  overrides: Partial<{
    thinking: ThinkingLevel;
    thinkingLevels: ThinkingLevel[];
  }> = {},
): LLMGenerateRequest {
  return {
    messages: [userMsg("hi")],
    tools: [],
    provider: {
      name: "anthropic-main",
      engine: "anthropic",
      apiKey: "test-key",
    },
    model: {
      id: "anthropic-main/claude-sonnet-4-5",
      provider: "anthropic-main",
      engine: "anthropic",
      model: "claude-sonnet-4-5",
      thinkingLevels: overrides.thinkingLevels ?? [
        ThinkingLevel.None,
        ThinkingLevel.Low,
        ThinkingLevel.Medium,
      ],
    },
    generation: {
      temperature: 0.7,
      thinking: overrides.thinking ?? ThinkingLevel.Low,
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

  it("converts UserMessage with image content to user role with image block", () => {
    const result = convertMessages([userImageMsg()]);
    expect(result.messages).toHaveLength(1);
    const msg = result.messages[0]!;
    expect(msg.role).toBe("user");
    const content = msg.content as Array<{ type: string; source: { type: string; media_type: string; data: string } }>;
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: "iVBORw0KGgo=",
      },
    });
  });

  it("converts UserMessage with image and custom mediaType", () => {
    const result = convertMessages([userImageMsg({ mediaType: "image/jpeg" })]);
    const msg = result.messages[0]!;
    const content = msg.content as Array<{ type: string; source: { media_type: string } }>;
    expect(content[0]!.source.media_type).toBe("image/jpeg");
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
      content: "sunny, 25\u00B0C",
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

  it("uses supported partial thinking effort in request mode", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.Low,
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Low, ThinkingLevel.Medium],
    }));

    expect(params).toMatchObject({
      output_config: { effort: "low" },
    });
    expect(params).not.toHaveProperty("thinking");
  });

  it("downgrades unsupported high effort to nearest supported effort", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.High,
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Low, ThinkingLevel.Medium],
    }));

    expect(params).toMatchObject({
      output_config: { effort: "medium" },
    });
  });

  it("downgrades unsupported max effort to nearest supported effort", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.Max,
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.High],
    }));

    expect(params).toMatchObject({
      output_config: { effort: "high" },
    });
  });

  it("omits thinking and effort when no non-none level is supported", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.High,
      thinkingLevels: [ThinkingLevel.None],
    }));

    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("output_config");
  });

  it("omits thinking and effort when requested thinking is none", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.None,
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Low],
    }));

    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("output_config");
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
    expect(!Array.isArray(result.message)).toBe(true);
    if (!Array.isArray(result.message)) {
      expect(result.message.type).toBe(MessageType.Assist);
      expect(result.message.content).toBe("Hello!");
    }
    expect(result.tokenCount).toEqual({ input: 10, output: 5, total: 15 });
  });

  it("converts tool_use response to ToolCallMessage array", () => {
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
    expect(Array.isArray(result.message)).toBe(true);
    const toolCalls = result.message as Array<{ type: MessageType; content: string; toolCallId: string; toolName: string; arguments: Record<string, unknown> }>;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.type).toBe(MessageType.ToolCall);
    expect(toolCalls[0]!.content).toBe("Let me check.");
    expect(toolCalls[0]!.toolCallId).toBe("toolu_xyz");
    expect(toolCalls[0]!.toolName).toBe("search");
    expect(toolCalls[0]!.arguments).toEqual({ query: "test" });
  });

  it("converts multiple tool_use response to ToolCallMessage array", () => {
    const response = {
      id: "msg_4",
      type: "message" as const,
      role: "assistant" as const,
      content: [
        { type: "text" as const, text: "I'll search both.", citations: null },
        {
          type: "tool_use" as const,
          id: "toolu_a",
          name: "search",
          input: { query: "first" },
          caller: { type: "direct" as const },
        },
        {
          type: "tool_use" as const,
          id: "toolu_b",
          name: "search",
          input: { query: "second" },
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
    expect(Array.isArray(result.message)).toBe(true);
    const toolCalls = result.message as Array<{ type: MessageType; toolCallId: string; toolName: string; arguments: Record<string, unknown> }>;
    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]!.toolCallId).toBe("toolu_a");
    expect(toolCalls[0]!.arguments).toEqual({ query: "first" });
    expect(toolCalls[1]!.toolCallId).toBe("toolu_b");
    expect(toolCalls[1]!.arguments).toEqual({ query: "second" });
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
    expect(Array.isArray(result.message)).toBe(true);
    const toolCalls = result.message as Array<{ type: MessageType; content: string; toolCallId: string }>;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.type).toBe(MessageType.ToolCall);
    expect(toolCalls[0]!.content).toBe("");
    expect(toolCalls[0]!.toolCallId).toBe("toolu_123");
  });
});

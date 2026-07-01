import { describe, it, expect } from "vitest";
import { MessageType } from "../../core/types.js";
import {
  convertMessages,
  buildCreateParams,
  buildCreateParamsFromRequest,
  convertResponse,
} from "./convert.js";
import type { Message } from "../../core/types.js";
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

function assistMsg(content: string, reasoningContent?: string): Message {
  return {
    id: "assist-1",
    type: MessageType.Assist,
    content,
    ...(reasoningContent !== undefined && { reasoningContent }),
  };
}

function toolCallMsg(
  overrides: Partial<{
    content: string;
    toolCallId: string;
    toolName: string;
    arguments: Record<string, unknown>;
    reasoningContent: string;
  }> = {},
): Message {
  return {
    id: "tc-1",
    type: MessageType.ToolCall,
    content: overrides.content ?? "",
    toolCallId: overrides.toolCallId ?? "call_abc",
    toolName: overrides.toolName ?? "get_weather",
    arguments: overrides.arguments ?? { city: "Beijing" },
    ...(overrides.reasoningContent !== undefined && {
      reasoningContent: overrides.reasoningContent,
    }),
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
  provider: "glm",
  model: "glm-5",
  apiKey: "test-key",
  baseUrl: "",
};

function request(
  overrides: Partial<{
    engine: string;
    model: string;
    thinking: ThinkingLevel;
    thinkingLevels: ThinkingLevel[];
  }> = {},
): LLMGenerateRequest {
  const engine = overrides.engine ?? "glm";
  const model = overrides.model ?? "glm-5.2";
  return {
    messages: [userMsg("hi")],
    tools: [],
    provider: {
      name: "provider",
      engine,
      apiKey: "test-key",
    },
    model: {
      id: `provider/${model}`,
      provider: "provider",
      engine,
      model,
      thinkingLevels: overrides.thinkingLevels ?? [
        ThinkingLevel.None,
        ThinkingLevel.Low,
        ThinkingLevel.Medium,
        ThinkingLevel.High,
        ThinkingLevel.Max,
      ],
    },
    generation: {
      temperature: 0.7,
      thinking: overrides.thinking ?? ThinkingLevel.Low,
    },
  };
}

describe("GLM convertMessages", () => {
  it("converts AssistMessage without reasoningContent", () => {
    const result = convertMessages([assistMsg("Hi there")]);
    expect(result).toEqual([{ role: "assistant", content: "Hi there" }]);
  });

  it("converts AssistMessage with reasoningContent", () => {
    const result = convertMessages([
      assistMsg("The answer is 42", "Let me think step by step..."),
    ]);
    expect(result).toEqual([
      {
        role: "assistant",
        content: "The answer is 42",
        reasoning_content: "Let me think step by step...",
      },
    ]);
  });

  it("converts ToolCallMessage with reasoningContent", () => {
    const result = convertMessages([
      toolCallMsg({ reasoningContent: "I need to check the weather first" }),
    ]);
    expect(result).toHaveLength(1);
    const msg = result[0]!;
    expect(msg).toMatchObject({
      role: "assistant",
      content: null,
      reasoning_content: "I need to check the weather first",
    });
    expect(msg).toHaveProperty("tool_calls");
  });

  it("converts full conversation with reasoningContent round-trip", () => {
    const messages: Message[] = [
      sysMsg("Be helpful"),
      userMsg("What's the weather?"),
      toolCallMsg({ reasoningContent: "User asks about weather" }),
      toolResultMsg(),
      assistMsg("It's sunny in Beijing.", "The tool returned sunny weather data"),
    ];
    const result = convertMessages(messages);
    expect(result).toHaveLength(5);
    expect((result[2] as { reasoning_content?: string }).reasoning_content).toBe(
      "User asks about weather",
    );
    expect((result[4] as { reasoning_content?: string }).reasoning_content).toBe(
      "The tool returned sunny weather data",
    );
  });
});

describe("GLM buildCreateParams", () => {
  it("includes thinking enabled when config.thinking is true", () => {
    const config: ModelConfig = { ...baseConfig, thinking: true };
    const params = buildCreateParams([userMsg("hi")], config, []);
    expect(params).toMatchObject({
      thinking: { type: "enabled" },
    });
  });

  it("includes thinking disabled when config.thinking is false", () => {
    const config: ModelConfig = { ...baseConfig, thinking: false };
    const params = buildCreateParams([userMsg("hi")], config, []);
    expect(params).toMatchObject({
      thinking: { type: "disabled" },
    });
  });

  it("omits thinking when config.thinking is undefined", () => {
    const params = buildCreateParams([userMsg("hi")], baseConfig, []);
    expect(params).not.toHaveProperty("thinking");
  });

  it("includes level-aware reasoning effort for GLM-5.2 request mode", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.Low,
    }));

    expect(params).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "low",
    });
  });

  it("maps CodePlan low/medium/high efforts to high", () => {
    const params = buildCreateParamsFromRequest(request({
      engine: "glm-codeplan",
      thinking: ThinkingLevel.Medium,
    }));

    expect(params).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    });
  });

  it("maps CodePlan max effort to max", () => {
    const params = buildCreateParamsFromRequest(request({
      engine: "glm-codeplan",
      thinking: ThinkingLevel.Max,
    }));

    expect(params).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "max",
    });
  });

  it("omits reasoning_effort for boolean-only GLM thinking models", () => {
    const params = buildCreateParamsFromRequest(request({
      engine: "glm-codeplan",
      model: "glm-4.7",
      thinking: ThinkingLevel.High,
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
    }));

    expect(params).toMatchObject({
      thinking: { type: "enabled" },
    });
    expect(params).not.toHaveProperty("reasoning_effort");
  });

  it("disables thinking and omits reasoning_effort for none", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.None,
    }));

    expect(params).toMatchObject({
      thinking: { type: "disabled" },
    });
    expect(params).not.toHaveProperty("reasoning_effort");
  });

  it("omits thinking and reasoning_effort for no-thinking models", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.High,
      thinkingLevels: [ThinkingLevel.None],
    }));

    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("reasoning_effort");
  });
});

describe("GLM convertResponse", () => {
  it("extracts reasoning_content into reasoningContent on AssistMessage", () => {
    const response = {
      id: "chatcmpl-1",
      choices: [
        {
          message: {
            role: "assistant" as const,
            content: "The answer is 42",
            reasoning_content: "Let me analyze this step by step...",
          },
          finish_reason: "stop",
          index: 0,
        },
      ],
      created: 0,
      model: "glm-5",
      object: "chat.completion" as const,
    };

    const result = convertResponse(response as never);
    expect(!Array.isArray(result.message)).toBe(true);
    if (!Array.isArray(result.message)) {
      expect(result.message.type).toBe(MessageType.Assist);
      expect(result.message.content).toBe("The answer is 42");
      expect(result.message.reasoningContent).toBe("Let me analyze this step by step...");
    }
  });

  it("extracts reasoning_content on ToolCallMessage", () => {
    const response = {
      id: "chatcmpl-2",
      choices: [
        {
          message: {
            role: "assistant" as const,
            content: null,
            reasoning_content: "I should call a tool",
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
      model: "glm-5",
      object: "chat.completion" as const,
    };

    const result = convertResponse(response as never);
    expect(Array.isArray(result.message)).toBe(true);
    const toolCalls = result.message as Array<{ type: MessageType; toolCallId: string; reasoningContent?: string }>;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.type).toBe(MessageType.ToolCall);
    expect(toolCalls[0]!.toolCallId).toBe("call_xyz");
    expect(toolCalls[0]!.reasoningContent).toBe("I should call a tool");
  });

  it("handles response without reasoning_content", () => {
    const response = {
      id: "chatcmpl-3",
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
      model: "glm-5",
      object: "chat.completion" as const,
    };

    const result = convertResponse(response as never);
    expect(!Array.isArray(result.message)).toBe(true);
    if (!Array.isArray(result.message)) {
      expect(result.message.type).toBe(MessageType.Assist);
      expect(result.message.content).toBe("Hello!");
      expect(result.message.reasoningContent).toBeUndefined();
    }
  });
});

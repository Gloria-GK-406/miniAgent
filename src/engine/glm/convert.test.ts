import { describe, it, expect } from "vitest";
import { MessageType } from "../../core/types.js";
import {
  convertMessages,
  buildCreateParamsFromRequest,
  convertResponse,
} from "./convert.js";
import type { Message, Tool } from "../../core/types.js";
import {
  ThinkingLevel,
  type LLMGenerateRequest,
} from "../../core/config.js";
import { z } from "zod";

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

function makeTool(): Tool {
  return {
    name: "get_weather",
    description: "Get weather for a city",
    parameters: z.object({
      city: z.string(),
    }),
    execute: async () => "sunny",
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
  const provider = overrides.provider ?? "glm";
  const model = overrides.model ?? "glm-5.2";
  return {
    messages: [userMsg("hi")],
    tools: overrides.tools ?? [],
    provider: {
      provider,
      key: "test-key",
    },
    model: {
      id: `${provider}/${model}`,
      provider,
      name: model,
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
      ...(overrides.topP !== undefined && { topP: overrides.topP }),
      ...(overrides.maxOutputTokens !== undefined && {
        maxOutputTokens: overrides.maxOutputTokens,
      }),
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

describe("GLM buildCreateParamsFromRequest", () => {
  it("maps request fields to provider params", () => {
    const params = buildCreateParamsFromRequest(request({
      maxOutputTokens: 4096,
      topP: 0.9,
      tools: [makeTool()],
      thinking: ThinkingLevel.None,
    }));

    expect(params).toMatchObject({
      model: "glm-5.2",
      messages: [{ role: "user", content: "hi" }],
      max_completion_tokens: 4096,
      temperature: 0.7,
      top_p: 0.9,
      thinking: { type: "disabled" },
    });
    expect(params.tools).toHaveLength(1);
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

  it("downgrades unsupported GLM effort to nearest supported lower effort", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.Max,
      thinkingLevels: [
        ThinkingLevel.None,
        ThinkingLevel.Low,
        ThinkingLevel.Medium,
      ],
    }));

    expect(params).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "medium",
    });
  });

  it("omits thinking instead of upgrading low to medium", () => {
    const params = buildCreateParamsFromRequest(request({
      thinking: ThinkingLevel.Low,
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
    }));

    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("reasoning_effort");
  });

  it("maps CodePlan low/medium/high efforts to high", () => {
    const params = buildCreateParamsFromRequest(request({
      provider: "glm-codeplan",
      thinking: ThinkingLevel.Medium,
    }));

    expect(params).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    });
  });

  it("maps CodePlan max effort to max", () => {
    const params = buildCreateParamsFromRequest(request({
      provider: "glm-codeplan",
      thinking: ThinkingLevel.Max,
    }));

    expect(params).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "max",
    });
  });

  it("omits reasoning_effort for boolean-only GLM thinking models", () => {
    const params = buildCreateParamsFromRequest(request({
      provider: "glm-codeplan",
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

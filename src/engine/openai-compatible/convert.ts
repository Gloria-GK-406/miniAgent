import type {
  Message,
  SystemMessage,
  AssistMessage,
  ToolCallMessage,
  ToolResultMessage,
  Tool,
  ImageContent,
  LLMMessageResponse,
  LLMResponse,
} from "../../core/types.js";
import {
  ThinkingLevel,
  type LLMGenerateRequest,
} from "../../core/config.js";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionFunctionTool,
  ChatCompletion,
  ChatCompletionReasoningEffort,
} from "openai/resources/chat/completions/completions.js";
import { MessageType } from "../../core/types.js";
import { createTokenCount, emptyTokenCount } from "../../core/llm.js";
import { zodToJsonSchema } from "zod-to-json-schema";

function extractText(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (content.type === "text") return content.text;
  return "";
}

export function convertMessages(
  messages: Message[],
): ChatCompletionMessageParam[] {
  return messages.map((msg): ChatCompletionMessageParam => {
    switch (msg.type) {
      case MessageType.System:
        return convertSystemMessage(msg);
      case MessageType.User:
        return convertUserMessage(msg);
      case MessageType.Assist:
        return convertAssistMessage(msg);
      case MessageType.ToolCall:
        return convertToolCallMessage(msg);
      case MessageType.ToolResult:
        return convertToolResultMessage(msg);
    }
    throw new Error("Unknown message type");
  });
}

function convertSystemMessage(
  msg: SystemMessage,
): ChatCompletionMessageParam {
  return { role: "system", content: extractText(msg.content) };
}
function convertUserMessage(msg: { content: Message["content"] }): ChatCompletionMessageParam {
  if (typeof msg.content !== "string" && msg.content.type === "image") {
    const img = msg.content as ImageContent;
    return {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: "data:" + img.mediaType + ";base64," + img.data,
          },
        },
      ],
    };
  }
  return { role: "user", content: extractText(msg.content) };
}
function convertAssistMessage(msg: AssistMessage): ChatCompletionMessageParam {
  return { role: "assistant", content: extractText(msg.content) };
}
function convertToolCallMessage(
  msg: ToolCallMessage,
): ChatCompletionMessageParam {
  return {
    role: "assistant",
    content: extractText(msg.content) || null,
    tool_calls: [
      {
        id: msg.toolCallId,
        type: "function" as const,
        function: {
          name: msg.toolName,
          arguments: JSON.stringify(msg.arguments),
        },
      },
    ],
  };
}
function convertToolResultMessage(
  msg: ToolResultMessage,
): ChatCompletionMessageParam {
  return {
    role: "tool",
    tool_call_id: msg.toolCallId,
    content: extractText(msg.content),
  };
}
export function convertTools(tools: Tool[]): ChatCompletionTool[] {
  if (tools.length === 0) return [];
  return tools.map((tool): ChatCompletionFunctionTool => {
    const jsonSchema = zodToJsonSchema(tool.parameters);
    const { $schema: _, ...parameters } = jsonSchema as Record<string, unknown>;
    return {
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: parameters as Record<string, unknown>,
      },
    };
  });
}

function mapOpenAIReasoningEffort(level: ThinkingLevel): ChatCompletionReasoningEffort {
  switch (level) {
    case ThinkingLevel.Low:
      return "low";
    case ThinkingLevel.Medium:
      return "medium";
    case ThinkingLevel.High:
      return "high";
    case ThinkingLevel.Max:
      return "xhigh";
    case ThinkingLevel.None:
      return "none";
  }
}

const ORDERED_THINKING_LEVELS = [
  ThinkingLevel.Low,
  ThinkingLevel.Medium,
  ThinkingLevel.High,
  ThinkingLevel.Max,
] as const;

function selectSupportedReasoningLevel(
  requested: ThinkingLevel,
  supportedLevels: ThinkingLevel[],
): ThinkingLevel | undefined {
  if (requested === ThinkingLevel.None) {
    return undefined;
  }
  const supportedNonNone = ORDERED_THINKING_LEVELS.filter((level) =>
    supportedLevels.includes(level),
  );
  if (supportedNonNone.length === 0) {
    return undefined;
  }
  if (supportedNonNone.includes(requested)) {
    return requested;
  }

  const requestedIndex = ORDERED_THINKING_LEVELS.indexOf(requested);
  const lowerOrEqual = supportedNonNone.filter(
    (level) => ORDERED_THINKING_LEVELS.indexOf(level) <= requestedIndex,
  );
  return lowerOrEqual.at(-1);
}

function selectOpenAIReasoningLevel(request: LLMGenerateRequest): ThinkingLevel | undefined {
  if (request.model.provider !== "openai") {
    return undefined;
  }
  return selectSupportedReasoningLevel(
    request.generation.thinking,
    request.model.thinkingLevels,
  );
}

export function buildCreateParamsFromRequest(request: LLMGenerateRequest) {
  const reasoningLevel = selectOpenAIReasoningLevel(request);

  return {
    model: request.model.name,
    messages: convertMessages(request.messages),
    tools: convertTools(request.tools),
    ...(request.generation.maxOutputTokens !== undefined && {
      max_completion_tokens: request.generation.maxOutputTokens,
    }),
    temperature: request.generation.temperature,
    ...(request.generation.topP !== undefined && {
      top_p: request.generation.topP,
    }),
    ...(reasoningLevel !== undefined && {
      reasoning_effort: mapOpenAIReasoningEffort(reasoningLevel),
    }),
  };
}

export function convertResponse(
  response: ChatCompletion,
): LLMResponse {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error("No choices in OpenAI response");
  }
  const message = choice.message;
  const toolCalls = message.tool_calls;
  let converted: LLMMessageResponse;
  if (toolCalls && toolCalls.length > 0) {
    converted = toolCalls
      .filter((tc) => tc.type === "function")
      .map((tc) => {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        return {
          id: crypto.randomUUID(),
          type: MessageType.ToolCall,
          content: message.content ?? "",
          toolCallId: tc.id,
          toolName: tc.function.name,
          arguments: args,
        };
      });
  } else {
    converted = {
      type: MessageType.Assist,
      id: crypto.randomUUID(),
      content: message.content ?? "",
    };
  }
  return {
    message: converted,
    tokenCount: response.usage
      ? createTokenCount(response.usage.prompt_tokens, response.usage.completion_tokens)
      : emptyTokenCount(),
  };
}

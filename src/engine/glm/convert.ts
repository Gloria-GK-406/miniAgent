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
import type { ModelConfig } from "../../core/config.js";
import type {
  ChatCompletionMessageParam,
  ChatCompletion,
} from "openai/resources/chat/completions/completions.js";
import { MessageType } from "../../core/types.js";
import { createTokenCount, emptyTokenCount } from "../../core/llm.js";
import { convertTools } from "../openai-compatible/convert.js";

type GLMMessageParam = ChatCompletionMessageParam & {
  reasoning_content?: string;
};

function extractText(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (content.type === "text") return content.text;
  return "";
}

function extractReasoningContent(
  message: ChatCompletion["choices"][number]["message"],
): string | undefined {
  return (message as unknown as { reasoning_content?: string }).reasoning_content;
}

export function convertMessages(
  messages: Message[],
): GLMMessageParam[] {
  return messages.map((msg): GLMMessageParam => {
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
): GLMMessageParam {
  return { role: "system", content: extractText(msg.content) } as GLMMessageParam;
}

function convertUserMessage(msg: { content: Message["content"] }): GLMMessageParam {
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
    } as GLMMessageParam;
  }
  return { role: "user", content: extractText(msg.content) } as GLMMessageParam;
}

function convertAssistMessage(msg: AssistMessage): GLMMessageParam {
  return {
    role: "assistant",
    content: extractText(msg.content),
    ...(msg.reasoningContent !== undefined && {
      reasoning_content: msg.reasoningContent,
    }),
  } as GLMMessageParam;
}

function convertToolCallMessage(
  msg: ToolCallMessage,
): GLMMessageParam {
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
    ...(msg.reasoningContent !== undefined && {
      reasoning_content: msg.reasoningContent,
    }),
  } as GLMMessageParam;
}

function convertToolResultMessage(
  msg: ToolResultMessage,
): GLMMessageParam {
  return {
    role: "tool",
    tool_call_id: msg.toolCallId,
    content: extractText(msg.content),
  } as GLMMessageParam;
}

export function buildCreateParams(
  messages: Message[],
  config: ModelConfig,
  tools: Tool[],
) {
  return {
    model: config.model,
    messages: convertMessages(messages),
    tools: convertTools(tools),
    ...(config.thinking !== undefined && {
      thinking: {
        type: config.thinking ? ("enabled" as const) : ("disabled" as const),
      },
    }),
    ...(config.maxTokens !== undefined && { max_tokens: config.maxTokens }),
    ...(config.maxOutputTokens !== undefined && {
      max_completion_tokens: config.maxOutputTokens,
    }),
    ...(config.temperature !== undefined && {
      temperature: config.temperature,
    }),
    ...(config.topP !== undefined && { top_p: config.topP }),
  };
}

export function convertResponse(
  response: ChatCompletion,
): LLMResponse {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error("No choices in GLM response");
  }
  const message = choice.message;
  const reasoningContent = extractReasoningContent(message);
  const toolCalls = message.tool_calls;
  let converted: LLMMessageResponse;
  if (toolCalls && toolCalls.length > 0) {
    converted = toolCalls
      .filter((tc) => tc.type === "function")
      .map((tc) => {
        const args = JSON.parse(tc.function.arguments) as Record<
          string,
          unknown
        >;
        return {
          id: crypto.randomUUID(),
          type: MessageType.ToolCall,
          content: message.content ?? "",
          toolCallId: tc.id,
          toolName: tc.function.name,
          arguments: args,
          ...(reasoningContent !== undefined && { reasoningContent }),
        };
      });
  } else {
    converted = {
      type: MessageType.Assist,
      id: crypto.randomUUID(),
      content: message.content ?? "",
      ...(reasoningContent !== undefined && { reasoningContent }),
    };
  }
  return {
    message: converted,
    tokenCount: response.usage
      ? createTokenCount(response.usage.prompt_tokens, response.usage.completion_tokens)
      : emptyTokenCount(),
  };
}

import type {
  Message,
  SystemMessage,
  AssistMessage,
  ToolCallMessage,
  ToolResultMessage,
  Tool,
  ImageContent,
} from "../../core/types.js";
import type { ModelConfig } from "../../core/config.js";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionFunctionTool,
  ChatCompletion
} from "openai/resources/chat/completions/completions.js";
import { MessageType } from "../../core/types.js";
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
      default:
        throw new Error("Unknown message type: " + msg.type);
    }
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
export function buildCreateParams(
  messages: Message[],
  config: ModelConfig,
  tools: Tool[],
) {
  return {
    model: config.model,
    messages: convertMessages(messages),
    tools: convertTools(tools),
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
  response: ChatCompletion
): AssistMessage | ToolCallMessage[] {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error("No choices in OpenAI response");
  }
  const message = choice.message;
  const toolCalls = message.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    return toolCalls
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
  }
  return {
    type: MessageType.Assist,
    id: crypto.randomUUID(),
    content: message.content ?? "",
  };
}

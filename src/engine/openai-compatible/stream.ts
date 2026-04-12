import type {
  ChatCompletionChunk,
} from "openai/resources/chat/completions/completions.js";
import type { LLMResponse, LLMStreamChunk } from "../../core/types.js";
import { LLMStreamChunkType, MessageType } from "../../core/types.js";
import { createTokenCount, emptyTokenCount } from "../../core/llm.js";

interface OpenAIToolCallBuffer {
  id?: string;
  name: string;
  argumentsText: string;
}

export interface ConsumeOpenAIStreamOptions {
  emitChunk: (chunk: LLMStreamChunk) => void;
  extractReasoningDelta?: (chunk: ChatCompletionChunk) => string | undefined;
  shouldBreak?: () => boolean;
}

function getToolCallBuffer(
  buffers: OpenAIToolCallBuffer[],
  index: number,
): OpenAIToolCallBuffer {
  const existing = buffers[index];
  if (existing) {
    return existing;
  }
  const created: OpenAIToolCallBuffer = {
    name: "",
    argumentsText: "",
  };
  buffers[index] = created;
  return created;
}

export async function consumeOpenAIStream(
  stream: AsyncIterable<ChatCompletionChunk>,
  options: ConsumeOpenAIStreamOptions,
): Promise<LLMResponse> {
  let content = "";
  let reasoningContent = "";
  const toolCalls: OpenAIToolCallBuffer[] = [];
  let tokenCount = emptyTokenCount();

  for await (const chunk of stream) {
    if (options.shouldBreak?.()) {
      break;
    }

    if (chunk.usage) {
      tokenCount = createTokenCount(chunk.usage.prompt_tokens, chunk.usage.completion_tokens);
    }

    const choice = chunk.choices[0];
    if (!choice) {
      continue;
    }

    const reasoningDelta = options.extractReasoningDelta?.(chunk);
    if (reasoningDelta) {
      reasoningContent += reasoningDelta;
      options.emitChunk({
        type: LLMStreamChunkType.ReasoningDelta,
        text: reasoningDelta,
      });
    }

    const delta = choice.delta;
    if (delta.content) {
      content += delta.content;
      options.emitChunk({
        type: LLMStreamChunkType.TextDelta,
        text: delta.content,
      });
    }

    for (const toolCallDelta of delta.tool_calls ?? []) {
      const current = getToolCallBuffer(toolCalls, toolCallDelta.index);
      if (toolCallDelta.id) {
        current.id = toolCallDelta.id;
      }
      if (toolCallDelta.function?.name) {
        current.name += toolCallDelta.function.name;
      }
      if (toolCallDelta.function?.arguments) {
        current.argumentsText += toolCallDelta.function.arguments;
        options.emitChunk({
          type: LLMStreamChunkType.ToolCallArgumentsDelta,
          index: toolCallDelta.index,
          argsText: toolCallDelta.function.arguments,
          ...(current.id !== undefined && { toolCallId: current.id }),
          ...(current.name !== "" && { toolName: current.name }),
        });
      }
    }
  }

  if (toolCalls.length > 0) {
    return {
      message: toolCalls.map((toolCall) => {
      if (!toolCall.id) {
        throw new Error("OpenAI stream ended without a tool call id");
      }
      if (!toolCall.name) {
        throw new Error("OpenAI stream ended without a tool name");
      }
      const argumentsObject = toolCall.argumentsText
        ? JSON.parse(toolCall.argumentsText) as Record<string, unknown>
        : {};
      return {
        id: crypto.randomUUID(),
        type: MessageType.ToolCall,
        content,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        arguments: argumentsObject,
        ...(reasoningContent !== "" && { reasoningContent }),
      };
      }),
      tokenCount,
    };
  }

  return {
    message: {
      id: crypto.randomUUID(),
      type: MessageType.Assist,
      content,
      ...(reasoningContent !== "" && { reasoningContent }),
    },
    tokenCount,
  };
}

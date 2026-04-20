import type {
  ChatCompletionChunk,
} from "openai/resources/chat/completions/completions.js";
import type { LLMResponse, LLMStreamChunk } from "../../core/types.js";
import { LLMStreamChunkType, MessageType } from "../../core/types.js";
import { createTokenCount, emptyTokenCount } from "../../core/llm.js";

const THINKING_OPEN = "<think>";
const THINKING_CLOSE = "</think>";

interface OpenAIToolCallBuffer {
  id?: string;
  name: string;
  argumentsText: string;
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

enum ParseState {
  Content,
  Thinking,
}

export interface ConsumeNVIDIAStreamOptions {
  emitChunk: (chunk: LLMStreamChunk) => void;
  shouldBreak?: () => boolean;
}

export async function consumeNVIDIAStream(
  stream: AsyncIterable<ChatCompletionChunk>,
  options: ConsumeNVIDIAStreamOptions,
): Promise<LLMResponse> {
  let state = ParseState.Content;
  let buffer = "";
  let content = "";
  let reasoningContent = "";
  const toolCalls: OpenAIToolCallBuffer[] = [];
  let tokenCount = emptyTokenCount();

  function emitReasoning(text: string): void {
    reasoningContent += text;
    options.emitChunk({
      type: LLMStreamChunkType.ReasoningDelta,
      text,
    });
  }

  function emitText(text: string): void {
    content += text;
    options.emitChunk({
      type: LLMStreamChunkType.TextDelta,
      text,
    });
  }

  function processText(text: string): void {
    buffer += text;

    while (buffer.length > 0) {
      if (state === ParseState.Content) {
        const markerIdx = buffer.indexOf("<");
        if (markerIdx === -1) {
          emitText(buffer);
          buffer = "";
          return;
        }

        if (markerIdx > 0) {
          emitText(buffer.slice(0, markerIdx));
          buffer = buffer.slice(markerIdx);
        }

        if (buffer.startsWith(THINKING_OPEN)) {
          state = ParseState.Thinking;
          buffer = buffer.slice(THINKING_OPEN.length);
          continue;
        }
        if (THINKING_OPEN.startsWith(buffer)) {
          return;
        }

        emitText(buffer[0]!);
        buffer = buffer.slice(1);
        continue;
      }

      const markerIdx = buffer.indexOf("<");
      if (markerIdx === -1) {
        emitReasoning(buffer);
        buffer = "";
        return;
      }

      if (markerIdx > 0) {
        emitReasoning(buffer.slice(0, markerIdx));
        buffer = buffer.slice(markerIdx);
      }

      if (buffer.startsWith(THINKING_CLOSE)) {
        state = ParseState.Content;
        buffer = buffer.slice(THINKING_CLOSE.length);
        continue;
      }
      if (THINKING_CLOSE.startsWith(buffer)) {
        return;
      }

      emitReasoning(buffer[0]!);
      buffer = buffer.slice(1);
    }
  }

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

    const delta = choice.delta;

    if (delta.content) {
      processText(delta.content);
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

  if (buffer.length > 0) {
    if (state === ParseState.Content) {
      emitText(buffer);
    } else {
      emitReasoning(buffer);
    }
  }

  if (toolCalls.length > 0) {
    return {
      message: toolCalls.map((toolCall) => {
        if (!toolCall.id) {
          throw new Error("NVIDIA stream ended without a tool call id");
        }
        if (!toolCall.name) {
          throw new Error("NVIDIA stream ended without a tool name");
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

import type {
  ChatCompletionChunk,
} from "openai/resources/chat/completions/completions.js";
import type { LLMResponse, LLMStreamChunk } from "../../core/index.js";
import { LLMStreamChunkType, MessageType } from "../../core/index.js";
import { createTokenCount, emptyTokenCount } from "../../core/index.js";
import { z } from "zod";

const THINKING_OPEN = "<think>";
const THINKING_CLOSE = "</think>";

interface OpenAIToolCallBuffer {
  id?: string;
  name: string;
  argumentsText: string;
  startEmitted: boolean;
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
    startEmitted: false,
  };
  buffers[index] = created;
  return created;
}

function appendToolCallName(currentName: string, namePart: string): string {
  if (currentName === "" || namePart.startsWith(currentName)) {
    return namePart;
  }
  if (
    currentName === namePart
    || currentName.endsWith(namePart)
    || currentName.includes(namePart)
  ) {
    return currentName;
  }

  const maxOverlap = Math.min(currentName.length, namePart.length);
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    if (currentName.endsWith(namePart.slice(0, overlap))) {
      return currentName + namePart.slice(overlap);
    }
  }
  return currentName + namePart;
}

function toolCallStartChunk(
  index: number,
  toolCall: OpenAIToolCallBuffer,
): LLMStreamChunk {
  return {
    type: LLMStreamChunkType.ToolCallArgumentsDelta,
    index,
    argsText: "",
    ...(toolCall.id !== undefined && { toolCallId: toolCall.id }),
    ...(toolCall.name !== "" && { toolName: toolCall.name }),
  };
}

enum ParseState {
  Content,
  Thinking,
}

export const ConsumeNVIDIAStreamOptionsSchema = z.object({
  emitChunk: z.custom<(chunk: LLMStreamChunk) => void>(
    (value) => typeof value === "function",
  ),
  shouldBreak: z.custom<() => boolean>(
    (value) => typeof value === "function",
  ).optional(),
});

export type ConsumeNVIDIAStreamOptions = z.infer<
  typeof ConsumeNVIDIAStreamOptionsSchema
>;

export async function* streamNVIDIAChunks(
  stream: AsyncIterable<ChatCompletionChunk>,
): AsyncGenerator<LLMStreamChunk> {
  let state = ParseState.Content;
  let buffer = "";
  const toolCalls: OpenAIToolCallBuffer[] = [];

  function* emitReasoning(text: string): Generator<LLMStreamChunk> {
    yield {
      type: LLMStreamChunkType.ReasoningDelta,
      text,
    };
  }

  function* emitText(text: string): Generator<LLMStreamChunk> {
    yield {
      type: LLMStreamChunkType.TextDelta,
      text,
    };
  }

  function* processText(text: string): Generator<LLMStreamChunk> {
    buffer += text;

    while (buffer.length > 0) {
      if (state === ParseState.Content) {
        const markerIdx = buffer.indexOf("<");
        if (markerIdx === -1) {
          yield* emitText(buffer);
          buffer = "";
          return;
        }

        if (markerIdx > 0) {
          yield* emitText(buffer.slice(0, markerIdx));
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

        yield* emitText(buffer[0]!);
        buffer = buffer.slice(1);
        continue;
      }

      const markerIdx = buffer.indexOf("<");
      if (markerIdx === -1) {
        yield* emitReasoning(buffer);
        buffer = "";
        return;
      }

      if (markerIdx > 0) {
        yield* emitReasoning(buffer.slice(0, markerIdx));
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

      yield* emitReasoning(buffer[0]!);
      buffer = buffer.slice(1);
    }
  }

  for await (const chunk of stream) {
    if (chunk.usage) {
      yield {
        type: LLMStreamChunkType.Usage,
        tokenCount: createTokenCount(
          chunk.usage.prompt_tokens,
          chunk.usage.completion_tokens,
        ),
      };
    }
    const choice = chunk.choices[0];
    if (!choice) {
      continue;
    }

    const delta = choice.delta;

    if (delta.content) {
      yield* processText(delta.content);
    }

    for (const toolCallDelta of delta.tool_calls ?? []) {
      const current = getToolCallBuffer(toolCalls, toolCallDelta.index);
      if (toolCallDelta.id) {
        current.id = toolCallDelta.id;
      }
      if (toolCallDelta.function?.name) {
        current.name = appendToolCallName(
          current.name,
          toolCallDelta.function.name,
        );
      }
      const argumentsDelta = toolCallDelta.function?.arguments;
      if (argumentsDelta !== undefined) {
        current.argumentsText += argumentsDelta;
        current.startEmitted = true;
        yield {
          type: LLMStreamChunkType.ToolCallArgumentsDelta,
          index: toolCallDelta.index,
          argsText: argumentsDelta,
          ...(current.id !== undefined && { toolCallId: current.id }),
          ...(current.name !== "" && { toolName: current.name }),
        };
      } else if (!current.startEmitted && current.id !== undefined && current.name !== "") {
        current.startEmitted = true;
        yield toolCallStartChunk(toolCallDelta.index, current);
      }
    }
  }

  if (buffer.length > 0) {
    if (state === ParseState.Content) {
      yield* emitText(buffer);
    } else {
      yield* emitReasoning(buffer);
    }
  }
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
        current.name = appendToolCallName(
          current.name,
          toolCallDelta.function.name,
        );
      }
      if (toolCallDelta.function?.arguments) {
        current.argumentsText += toolCallDelta.function.arguments;
        current.startEmitted = true;
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

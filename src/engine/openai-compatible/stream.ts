import type {
  ChatCompletionChunk,
} from "openai/resources/chat/completions/completions.js";
import type { LLMResponse, LLMStreamChunk } from "../../core/index.js";
import { LLMStreamChunkType, MessageType } from "../../core/index.js";
import { createTokenCount, emptyTokenCount } from "../../core/index.js";
import { z } from "zod";

interface OpenAIToolCallBuffer {
  id?: string;
  name: string;
  argumentsText: string;
  startEmitted: boolean;
}

const ExtractReasoningDeltaSchema = z.custom<
  (chunk: ChatCompletionChunk) => string | undefined
>((value) => typeof value === "function");

export const ConsumeOpenAIStreamOptionsSchema = z.object({
  emitChunk: z.custom<(chunk: LLMStreamChunk) => void>(
    (value) => typeof value === "function",
  ),
  extractReasoningDelta: ExtractReasoningDeltaSchema.optional(),
  shouldBreak: z.custom<() => boolean>(
    (value) => typeof value === "function",
  ).optional(),
});

export type ConsumeOpenAIStreamOptions = z.infer<
  typeof ConsumeOpenAIStreamOptionsSchema
>;

export const StreamOpenAIChunksOptionsSchema = z.object({
  extractReasoningDelta: ExtractReasoningDeltaSchema.optional(),
});

export type StreamOpenAIChunksOptions = z.infer<
  typeof StreamOpenAIChunksOptionsSchema
>;

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

export async function* streamOpenAIChunks(
  stream: AsyncIterable<ChatCompletionChunk>,
  options: StreamOpenAIChunksOptions = {},
): AsyncGenerator<LLMStreamChunk> {
  const toolCalls: OpenAIToolCallBuffer[] = [];

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

    const reasoningDelta = options.extractReasoningDelta?.(chunk);
    if (reasoningDelta) {
      yield {
        type: LLMStreamChunkType.ReasoningDelta,
        text: reasoningDelta,
      };
    }

    const delta = choice.delta;
    if (delta.content) {
      yield {
        type: LLMStreamChunkType.TextDelta,
        text: delta.content,
      };
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

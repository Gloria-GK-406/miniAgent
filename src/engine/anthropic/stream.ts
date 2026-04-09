import type {
  RawMessageStreamEvent,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { LLMResponse, LLMStreamChunk } from "../../core/types.js";
import { LLMStreamChunkType, MessageType } from "../../core/types.js";
import { createTokenCount, emptyTokenCount } from "../../core/llm.js";

interface AnthropicToolUseBuffer {
  id: string;
  name: string;
  input: unknown;
  inputJson: string;
}

export interface ConsumeAnthropicStreamOptions {
  emitChunk: (chunk: LLMStreamChunk) => void;
}

function toToolArguments(toolUse: AnthropicToolUseBuffer): Record<string, unknown> {
  if (toolUse.inputJson !== "") {
    return JSON.parse(toolUse.inputJson) as Record<string, unknown>;
  }
  if (toolUse.input && typeof toolUse.input === "object" && !Array.isArray(toolUse.input)) {
    return toolUse.input as Record<string, unknown>;
  }
  return {};
}

export async function consumeAnthropicStream(
  stream: AsyncIterable<RawMessageStreamEvent>,
  options: ConsumeAnthropicStreamOptions,
): Promise<LLMResponse> {
  let content = "";
  let reasoningContent = "";
  const toolUses = new Map<number, AnthropicToolUseBuffer>();
  let tokenCount = emptyTokenCount();

  for await (const event of stream) {
    if (event.type === "message_start") {
      tokenCount = createTokenCount(
        (event.message.usage.input_tokens ?? 0)
          + (event.message.usage.cache_creation_input_tokens ?? 0)
          + (event.message.usage.cache_read_input_tokens ?? 0),
        event.message.usage.output_tokens,
      );
      continue;
    }

    if (event.type === "message_delta") {
      tokenCount = createTokenCount(
        (event.usage.input_tokens ?? 0)
          + (event.usage.cache_creation_input_tokens ?? 0)
          + (event.usage.cache_read_input_tokens ?? 0),
        event.usage.output_tokens,
      );
      continue;
    }

    if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
      const toolUse = event.content_block as ToolUseBlock;
      toolUses.set(event.index, {
        id: toolUse.id,
        name: toolUse.name,
        input: toolUse.input,
        inputJson: "",
      });
      continue;
    }

    if (event.type !== "content_block_delta") {
      continue;
    }

    if (event.delta.type === "text_delta") {
      content += event.delta.text;
      options.emitChunk({
        type: LLMStreamChunkType.TextDelta,
        text: event.delta.text,
      });
      continue;
    }

    if (event.delta.type === "thinking_delta") {
      reasoningContent += event.delta.thinking;
      options.emitChunk({
        type: LLMStreamChunkType.ReasoningDelta,
        text: event.delta.thinking,
      });
      continue;
    }

    if (event.delta.type === "input_json_delta") {
      const toolUse = toolUses.get(event.index);
      if (!toolUse) {
        throw new Error(`Anthropic input_json_delta received before tool_use start at index ${event.index}`);
      }
      toolUse.inputJson += event.delta.partial_json;
      options.emitChunk({
        type: LLMStreamChunkType.ToolCallArgumentsDelta,
        index: event.index,
        argsText: event.delta.partial_json,
        toolCallId: toolUse.id,
        toolName: toolUse.name,
      });
    }
  }

  if (toolUses.size > 0) {
    return {
      message: [...toolUses.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, toolUse]) => ({
          id: crypto.randomUUID(),
          type: MessageType.ToolCall,
          content,
          toolCallId: toolUse.id,
          toolName: toolUse.name,
          arguments: toToolArguments(toolUse),
          ...(reasoningContent !== "" && { reasoningContent }),
        })),
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

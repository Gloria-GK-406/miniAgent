import { describe, expect, it } from "vitest";
import type {
  RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages/messages.js";
import { LLMStreamChunkType, MessageType } from "../../core/types.js";
import { consumeAnthropicStream } from "./stream.js";

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

describe("consumeAnthropicStream", () => {
  it("emits text and reasoning chunks and returns AssistMessage", async () => {
    const chunks: unknown[] = [];
    const events: RawMessageStreamEvent[] = [
      {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "thinking_delta",
          thinking: "step-1",
        },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: {
          type: "text_delta",
          text: "Hello",
        },
      },
    ] as RawMessageStreamEvent[];

    const result = await consumeAnthropicStream(toAsyncIterable(events), {
      emitChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(chunks).toEqual([
      { type: LLMStreamChunkType.ReasoningDelta, text: "step-1" },
      { type: LLMStreamChunkType.TextDelta, text: "Hello" },
    ]);
    expect(result).toMatchObject({
      message: {
        type: MessageType.Assist,
        content: "Hello",
        reasoningContent: "step-1",
      },
      tokenCount: { input: 0, output: 0, total: 0 },
    });
  });

  it("assembles tool calls from tool_use blocks and json deltas", async () => {
    const chunks: unknown[] = [];
    const events: RawMessageStreamEvent[] = [
      {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_1",
          name: "get_weather",
          input: {},
          caller: { type: "direct" },
        },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: "{\"city\":\"Bei",
        },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: "jing\"}",
        },
      },
    ] as RawMessageStreamEvent[];

    const result = await consumeAnthropicStream(toAsyncIterable(events), {
      emitChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(chunks).toEqual([
      {
        type: LLMStreamChunkType.ToolCallArgumentsDelta,
        index: 0,
        argsText: "{\"city\":\"Bei",
        toolCallId: "toolu_1",
        toolName: "get_weather",
      },
      {
        type: LLMStreamChunkType.ToolCallArgumentsDelta,
        index: 0,
        argsText: "jing\"}",
        toolCallId: "toolu_1",
        toolName: "get_weather",
      },
    ]);
    expect(result).toMatchObject({
      message: [
        {
          type: MessageType.ToolCall,
          toolCallId: "toolu_1",
          toolName: "get_weather",
          arguments: { city: "Beijing" },
        },
      ],
      tokenCount: { input: 0, output: 0, total: 0 },
    });
  });
});

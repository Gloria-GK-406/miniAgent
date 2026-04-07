import { describe, expect, it } from "vitest";
import type {
  ChatCompletionChunk,
} from "openai/resources/chat/completions/completions.js";
import { LLMStreamChunkType, MessageType } from "../../core/types.js";
import { consumeOpenAIStream } from "./stream.js";

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

function chunk(
  delta: Record<string, unknown>,
): ChatCompletionChunk {
  return {
    id: "chunk-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "gpt-test",
    choices: [
      {
        index: 0,
        finish_reason: null,
        delta,
      },
    ],
  } as ChatCompletionChunk;
}

describe("consumeOpenAIStream", () => {
  it("emits text chunks and returns a final AssistMessage", async () => {
    const chunks: unknown[] = [];

    const result = await consumeOpenAIStream(
      toAsyncIterable([
        chunk({ content: "Hel" }),
        chunk({ content: "lo" }),
      ]),
      {
        emitChunk: (streamChunk) => {
          chunks.push(streamChunk);
        },
      },
    );

    expect(chunks).toEqual([
      { type: LLMStreamChunkType.TextDelta, text: "Hel" },
      { type: LLMStreamChunkType.TextDelta, text: "lo" },
    ]);
    expect(result).toMatchObject({
      type: MessageType.Assist,
      content: "Hello",
    });
  });

  it("assembles tool calls and reasoning content from stream deltas", async () => {
    const chunks: unknown[] = [];

    const result = await consumeOpenAIStream(
      toAsyncIterable([
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              function: { name: "get_weather", arguments: "{\"city\"" },
            },
          ],
          reasoning_content: "think-1",
        }),
        chunk({
          tool_calls: [
            {
              index: 0,
              function: { arguments: ":\"Beijing\"}" },
            },
          ],
          content: "Checking...",
          reasoning_content: "think-2",
        }),
      ]),
      {
        emitChunk: (streamChunk) => {
          chunks.push(streamChunk);
        },
        extractReasoningDelta: (streamChunk) => {
          const choice = streamChunk.choices[0];
          if (!choice) {
            return undefined;
          }
          return (choice.delta as { reasoning_content?: string }).reasoning_content;
        },
      },
    );

    expect(chunks).toEqual([
      { type: LLMStreamChunkType.ReasoningDelta, text: "think-1" },
      {
        type: LLMStreamChunkType.ToolCallArgumentsDelta,
        index: 0,
        argsText: "{\"city\"",
        toolCallId: "call_1",
        toolName: "get_weather",
      },
      { type: LLMStreamChunkType.ReasoningDelta, text: "think-2" },
      { type: LLMStreamChunkType.TextDelta, text: "Checking..." },
      {
        type: LLMStreamChunkType.ToolCallArgumentsDelta,
        index: 0,
        argsText: ":\"Beijing\"}",
        toolCallId: "call_1",
        toolName: "get_weather",
      },
    ]);
    expect(result).toMatchObject([
      {
        type: MessageType.ToolCall,
        content: "Checking...",
        toolCallId: "call_1",
        toolName: "get_weather",
        arguments: { city: "Beijing" },
        reasoningContent: "think-1think-2",
      },
    ]);
  });
});

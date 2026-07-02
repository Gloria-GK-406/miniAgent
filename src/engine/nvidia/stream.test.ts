import { describe, expect, it } from "vitest";
import type {
  ChatCompletionChunk,
} from "openai/resources/chat/completions/completions.js";
import { LLMStreamChunkType, MessageType } from "../../core/types.js";
import { consumeNVIDIAStream, streamNVIDIAChunks } from "./stream.js";

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
    model: "nvidia-test",
    choices: [
      {
        index: 0,
        finish_reason: null,
        delta,
      },
    ],
  } as ChatCompletionChunk;
}

async function collectStreamChunks(
  stream: AsyncGenerator<unknown>,
): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("streamNVIDIAChunks", () => {
  it("emits one empty tool-call delta when id/name arrive without arguments", async () => {
    await expect(
      collectStreamChunks(
        streamNVIDIAChunks(toAsyncIterable([
          chunk({
            tool_calls: [
              {
                index: 0,
                id: "call_empty",
                function: { name: "get_weather" },
              },
            ],
          }),
          chunk({
            tool_calls: [
              {
                index: 0,
                id: "call_empty",
                function: { name: "_duplicate" },
              },
            ],
          }),
        ])),
      ),
    ).resolves.toEqual([
      {
        type: LLMStreamChunkType.ToolCallArgumentsDelta,
        index: 0,
        argsText: "",
        toolCallId: "call_empty",
        toolName: "get_weather",
      },
    ]);
  });

  it("does not duplicate repeated tool-call metadata before arguments arrive", async () => {
    await expect(
      collectStreamChunks(
        streamNVIDIAChunks(toAsyncIterable([
          chunk({
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                function: { name: "get_weather" },
              },
            ],
          }),
          chunk({
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                function: { name: "get_weather" },
              },
            ],
          }),
          chunk({
            tool_calls: [
              {
                index: 0,
                function: { arguments: "{\"city\":\"Beijing\"}" },
              },
            ],
          }),
        ])),
      ),
    ).resolves.toEqual([
      {
        type: LLMStreamChunkType.ToolCallArgumentsDelta,
        index: 0,
        argsText: "",
        toolCallId: "call_1",
        toolName: "get_weather",
      },
      {
        type: LLMStreamChunkType.ToolCallArgumentsDelta,
        index: 0,
        argsText: "{\"city\":\"Beijing\"}",
        toolCallId: "call_1",
        toolName: "get_weather",
      },
    ]);
  });
});

describe("consumeNVIDIAStream", () => {
  it("emits text chunks without thinking", async () => {
    const emitted: unknown[] = [];

    const result = await consumeNVIDIAStream(
      toAsyncIterable([
        chunk({ content: "Hel" }),
        chunk({ content: "lo" }),
      ]),
      {
        emitChunk: (c) => { emitted.push(c); },
      },
    );

    expect(emitted).toEqual([
      { type: LLMStreamChunkType.TextDelta, text: "Hel" },
      { type: LLMStreamChunkType.TextDelta, text: "lo" },
    ]);
    expect(result.message).toMatchObject({
      type: MessageType.Assist,
      content: "Hello",
    });
    if (!Array.isArray(result.message)) {
      expect(result.message.reasoningContent).toBeUndefined();
    }
  });

  it("separates thinking block from content", async () => {
    const emitted: unknown[] = [];

    const result = await consumeNVIDIAStream(
      toAsyncIterable([
        chunk({ content: "<think> thinking here </think>actual answer" }),
      ]),
      {
        emitChunk: (c) => { emitted.push(c); },
      },
    );

    expect(emitted).toEqual([
      { type: LLMStreamChunkType.ReasoningDelta, text: " thinking here " },
      { type: LLMStreamChunkType.TextDelta, text: "actual answer" },
    ]);
    expect(result.message).toMatchObject({
      type: MessageType.Assist,
      content: "actual answer",
      reasoningContent: " thinking here ",
    });
  });

  it("handles thinking split across multiple chunks", async () => {
    const emitted: unknown[] = [];

    const result = await consumeNVIDIAStream(
      toAsyncIterable([
        chunk({ content: "<th" }),
        chunk({ content: "ink>" }),
        chunk({ content: "step 1\n" }),
        chunk({ content: "step 2" }),
        chunk({ content: "</th" }),
        chunk({ content: "ink>" }),
        chunk({ content: "final answer" }),
      ]),
      {
        emitChunk: (c) => { emitted.push(c); },
      },
    );

    expect(result.message).toMatchObject({
      type: MessageType.Assist,
      content: "final answer",
      reasoningContent: "step 1\nstep 2",
    });
    if (!Array.isArray(result.message)) {
      expect(result.message.reasoningContent).toBe("step 1\nstep 2");
    }

    const reasoningChunks = emitted.filter(
      (c) => (c as { type: string }).type === LLMStreamChunkType.ReasoningDelta,
    );
    const textChunks = emitted.filter(
      (c) => (c as { type: string }).type === LLMStreamChunkType.TextDelta,
    );
    expect(reasoningChunks.length).toBeGreaterThan(0);
    expect(textChunks).toEqual([
      { type: LLMStreamChunkType.TextDelta, text: "final answer" },
    ]);
  });

  it("handles close delimiter split across chunks", async () => {
    const emitted: unknown[] = [];

    const result = await consumeNVIDIAStream(
      toAsyncIterable([
        chunk({ content: "<think>reasoning" }),
        chunk({ content: " here</th" }),
        chunk({ content: "ink>content" }),
      ]),
      {
        emitChunk: (c) => { emitted.push(c); },
      },
    );

    expect(result.message).toMatchObject({
      type: MessageType.Assist,
      content: "content",
      reasoningContent: "reasoning here",
    });
  });

  it("handles thinking open delimiter split across 4 chunks", async () => {
    const emitted: unknown[] = [];

    const result = await consumeNVIDIAStream(
      toAsyncIterable([
        chunk({ content: "<" }),
        chunk({ content: "th" }),
        chunk({ content: "in" }),
        chunk({ content: "k>reasoning</think>answer" }),
      ]),
      {
        emitChunk: (c) => { emitted.push(c); },
      },
    );

    expect(result.message).toMatchObject({
      type: MessageType.Assist,
      content: "answer",
      reasoningContent: "reasoning",
    });
  });

  it("handles thinking with no content after close", async () => {
    const emitted: unknown[] = [];

    const result = await consumeNVIDIAStream(
      toAsyncIterable([
        chunk({ content: "<think>just thinking</think>" }),
      ]),
      {
        emitChunk: (c) => { emitted.push(c); },
      },
    );

    expect(result.message).toMatchObject({
      type: MessageType.Assist,
      content: "",
      reasoningContent: "just thinking",
    });
  });

  it("handles unclosed thinking block as reasoning", async () => {
    const emitted: unknown[] = [];

    const result = await consumeNVIDIAStream(
      toAsyncIterable([
        chunk({ content: "<think>thinking without close" }),
      ]),
      {
        emitChunk: (c) => { emitted.push(c); },
      },
    );

    expect(result.message).toMatchObject({
      type: MessageType.Assist,
      content: "",
      reasoningContent: "thinking without close",
    });
  });

  it("falls back to normal text when tag candidate is not think", async () => {
    const emitted: unknown[] = [];

    const result = await consumeNVIDIAStream(
      toAsyncIterable([
        chunk({ content: "a <t" }),
        chunk({ content: "ag> b" }),
      ]),
      {
        emitChunk: (c) => { emitted.push(c); },
      },
    );

    expect(emitted).toEqual([
      { type: LLMStreamChunkType.TextDelta, text: "a " },
      { type: LLMStreamChunkType.TextDelta, text: "<" },
      { type: LLMStreamChunkType.TextDelta, text: "tag> b" },
    ]);
    expect(result.message).toMatchObject({
      type: MessageType.Assist,
      content: "a <tag> b",
    });
    if (!Array.isArray(result.message)) {
      expect(result.message.reasoningContent).toBeUndefined();
    }
  });

  it("handles tool calls", async () => {
    const emitted: unknown[] = [];

    const result = await consumeNVIDIAStream(
      toAsyncIterable([
        chunk({
          content: "<think>let me check</think>",
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              function: { name: "get_weather", arguments: "{\"city\"" },
            },
          ],
        }),
        chunk({
          tool_calls: [
            {
              index: 0,
              function: { arguments: ":\"Beijing\"}" },
            },
          ],
        }),
      ]),
      {
        emitChunk: (c) => { emitted.push(c); },
      },
    );

    expect(Array.isArray(result.message)).toBe(true);
    const toolCalls = result.message as Array<{
      type: MessageType;
      toolCallId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      reasoningContent?: string;
      content: string;
    }>;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]!.type).toBe(MessageType.ToolCall);
    expect(toolCalls[0]!.toolCallId).toBe("call_1");
    expect(toolCalls[0]!.toolName).toBe("get_weather");
    expect(toolCalls[0]!.arguments).toEqual({ city: "Beijing" });
    expect(toolCalls[0]!.reasoningContent).toBe("let me check");
    expect(toolCalls[0]!.content).toBe("");
  });

  it("tracks token usage", async () => {
    const result = await consumeNVIDIAStream(
      toAsyncIterable([
        chunk({ content: "Hi" }),
        {
          id: "chunk-2",
          object: "chat.completion.chunk",
          created: 1,
          model: "nvidia-test",
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        } as ChatCompletionChunk,
      ]),
      {
        emitChunk: () => {},
      },
    );

    expect(result.tokenCount).toEqual({
      input: 10,
      output: 5,
      total: 15,
    });
  });

  it("respects shouldBreak", async () => {
    let breakCalled = false;
    const emitted: unknown[] = [];

    const result = await consumeNVIDIAStream(
      toAsyncIterable([
        chunk({ content: "<think>reasoning</think>" }),
        chunk({ content: "part1" }),
        chunk({ content: "part2" }),
      ]),
      {
        emitChunk: (c) => {
          emitted.push(c);
          if ((c as { text: string }).text === "part1") {
            breakCalled = true;
          }
        },
        shouldBreak: () => breakCalled,
      },
    );

    expect(result.message).toMatchObject({
      type: MessageType.Assist,
      content: "part1",
      reasoningContent: "reasoning",
    });
  });
});

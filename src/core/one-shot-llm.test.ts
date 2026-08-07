import { describe, expect, it, vi } from "vitest";
import { ThinkingLevel, type LLMGenerateRequest, type ModelRuntime } from "./config.js";
import { OneShotLLM } from "./one-shot-llm.js";
import {
  LLMStreamChunkType,
  MessageType,
  type LLMRequest,
  type Message,
} from "./types.js";

const runtime: ModelRuntime = {
  provider: "test",
  key: "secret",
  model: { name: "model", thinkingLevels: [ThinkingLevel.None] },
};

const messages: Message[] = [{
  id: "request",
  type: MessageType.User,
  content: "hello",
}];

describe("OneShotLLM", () => {
  it("uses captured settings, forces empty tools, streams chunks, and reports once", async () => {
    const requests: LLMGenerateRequest[] = [];
    const llm: LLMRequest = {
      async *streamInvoke(request) {
        requests.push(request);
        yield { type: LLMStreamChunkType.TextDelta, text: "answer" };
        yield {
          type: LLMStreamChunkType.Usage,
          tokenCount: { input: 10, output: 2, total: 12 },
        };
      },
    };
    const reporter = { reportTokenUsage: vi.fn() };
    const caller = new OneShotLLM(
      llm,
      runtime,
      { temperature: 0.2, thinking: ThinkingLevel.Low },
      reporter,
    );
    const chunks: unknown[] = [];

    const handle = caller.invoke(messages);
    handle.onChunk((chunk) => chunks.push(chunk));
    const response = await handle;

    expect(requests).toEqual([{
      runtime,
      messages,
      tools: [],
      generation: { temperature: 0.2, thinking: ThinkingLevel.Low },
    }]);
    expect(chunks).toEqual([
      { type: LLMStreamChunkType.TextDelta, text: "answer" },
      {
        type: LLMStreamChunkType.Usage,
        tokenCount: { input: 10, output: 2, total: 12 },
      },
    ]);
    expect(response).toMatchObject({
      message: { content: "answer" },
      tokenCount: { input: 10, output: 2, total: 12 },
    });
    expect(reporter.reportTokenUsage).toHaveBeenCalledOnce();
    expect(reporter.reportTokenUsage).toHaveBeenCalledWith({
      input: 10,
      output: 2,
      total: 12,
    });
  });

  it("rejects a second invocation before making another provider request", async () => {
    const streamInvoke = vi.fn<LLMRequest["streamInvoke"]>(async function* () {
      yield { type: LLMStreamChunkType.TextDelta, text: "answer" };
    });
    const caller = new OneShotLLM(
      { streamInvoke },
      runtime,
      { temperature: 0.7, thinking: ThinkingLevel.Medium },
      { reportTokenUsage: () => {} },
    );

    await caller.invoke(messages);

    expect(() => caller.invoke(messages)).toThrow(/only be invoked once/i);
    expect(streamInvoke).toHaveBeenCalledOnce();
  });

  it("does not report an aborted invocation", async () => {
    const reporter = { reportTokenUsage: vi.fn() };
    const caller = new OneShotLLM(
      {
        async *streamInvoke() {
          yield { type: LLMStreamChunkType.TextDelta, text: "partial" };
          yield {
            type: LLMStreamChunkType.Usage,
            tokenCount: { input: 10, output: 2, total: 12 },
          };
        },
      },
      runtime,
      { temperature: 0.7, thinking: ThinkingLevel.Medium },
      reporter,
    );

    const handle = caller.invoke(messages);
    handle.abort();
    await handle;

    expect(reporter.reportTokenUsage).not.toHaveBeenCalled();
  });

  it("does not report when the provider supplies no usage", async () => {
    const reporter = { reportTokenUsage: vi.fn() };
    const caller = new OneShotLLM(
      {
        async *streamInvoke() {
          yield { type: LLMStreamChunkType.TextDelta, text: "answer" };
        },
      },
      runtime,
      { temperature: 0.7, thinking: ThinkingLevel.Medium },
      reporter,
    );

    await caller.invoke(messages);

    expect(reporter.reportTokenUsage).not.toHaveBeenCalled();
  });
});

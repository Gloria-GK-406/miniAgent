import { describe, expect, it } from "vitest";
import { ContextCompressor } from "./compressor.js";
import { ThinkingLevel, type LLMGenerateRequest, type ModelRuntime } from "../core/config.js";
import { LLMStreamChunkType, MessageType, type LLMRequest, type Message } from "../core/types.js";

function messages(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `message-${index}`,
    type: MessageType.User,
    content: `detail ${index}`,
  }));
}

function runtime(name: string): ModelRuntime {
  return {
    provider: "test",
    key: "secret",
    model: { name, thinkingLevels: [ThinkingLevel.None] },
  };
}

describe("ContextCompressor", () => {
  it("uses the current runtime for each compression request", async () => {
    const requests: LLMGenerateRequest[] = [];
    const llm: LLMRequest = {
      async *streamInvoke(request) {
        requests.push(request);
        yield { type: LLMStreamChunkType.TextDelta, text: "summary" };
      },
    };
    let current = runtime("first");
    const compressor = new ContextCompressor({ maxMessages: 3, keepRecent: 1 });
    await compressor.setLLMRequest(llm);
    compressor.setAgentRuntimeAccess({
      getModelRuntime: () => structuredClone(current),
      getGenerationConfig: () => ({ temperature: 0.2, thinking: ThinkingLevel.Low }),
    });

    compressor.updateMessages(messages(5));
    await compressor.maybeCompress();
    current = runtime("second");
    compressor.updateMessages(messages(6));
    await compressor.maybeCompress();

    expect(requests.map((request) => request.runtime.model.name))
      .toEqual(["first", "second"]);
    expect(requests[0]?.generation).toEqual({
      temperature: 0.2,
      thinking: ThinkingLevel.Low,
    });
  });

  it("does nothing until both LLM and runtime access are injected", async () => {
    const compressor = new ContextCompressor({ maxMessages: 3, keepRecent: 1 });
    compressor.updateMessages(messages(5));
    await compressor.maybeCompress();
    expect(compressor.getSummary()).toBeNull();
  });

  it("falls back to a local summary when generation fails", async () => {
    const compressor = new ContextCompressor({ maxMessages: 3, keepRecent: 1 });
    await compressor.setLLMRequest({
      async *streamInvoke() {
        throw new Error("offline");
        yield { type: LLMStreamChunkType.TextDelta, text: "unreachable" };
      },
    });
    compressor.setAgentRuntimeAccess({
      getModelRuntime: () => runtime("test"),
      getGenerationConfig: () => ({ temperature: 0.7, thinking: ThinkingLevel.Medium }),
    });
    compressor.updateMessages(messages(5));

    await compressor.maybeCompress();

    expect(compressor.getSummary()).toContain("detail 0");
    expect(compressor.getCompressedCount()).toBe(4);
  });
});

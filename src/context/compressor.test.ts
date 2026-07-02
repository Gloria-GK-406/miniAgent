import { describe, expect, it } from "vitest";
import { ThinkingLevel, type AgentConfig, type LLMGenerateRequest, type ResolvedModel } from "../core/config.js";
import {
  LLMStreamChunkType,
  MessageType,
  type LLMRequest,
  type Message,
  type MessageChunk,
} from "../core/types.js";
import { ContextCompressor } from "./compressor.js";

function userMessage(id: string, content: string): Message {
  return {
    id,
    type: MessageType.User,
    content,
  };
}

function createMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, index) =>
    userMessage(`user-${index + 1}`, `message ${index + 1}`),
  );
}

function createConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    providers: [{ provider: "openai", key: "test-key" }],
    defaultModel: { id: "fast" },
    plugins: new Map(),
    paths: { sessiondir: "test-session" },
    ...overrides,
  };
}

function createResolvedModel(overrides: Partial<ResolvedModel> = {}): ResolvedModel {
  return {
    id: "fast",
    provider: "openai",
    name: "gpt-4o-mini",
    thinkingLevels: [ThinkingLevel.None],
    capabilities: { thinking: [] },
    metadata: {},
    ...overrides,
  };
}

function textChunk(text: string): MessageChunk {
  return {
    type: LLMStreamChunkType.TextDelta,
    text,
  };
}

describe("ContextCompressor", () => {
  it("builds a request-mode summarization call", async () => {
    const capturedRequests: LLMGenerateRequest[] = [];
    const llm: LLMRequest = {
      getEngineModels: () => [createResolvedModel()],
      async *streamInvoke(request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
        capturedRequests.push(request);
        yield textChunk("summary ");
        yield textChunk("text");
      },
    };
    const compressor = new ContextCompressor({ maxMessages: 3, keepRecent: 1 });

    await compressor.setLLMRequest(llm);
    await compressor.setConfig(createConfig({
      generation: { temperature: 0.2, thinking: ThinkingLevel.Low },
    }));
    compressor.updateMessages(createMessages(4));

    await compressor.maybeCompress();

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]).toEqual(expect.objectContaining({
      provider: expect.objectContaining({
        provider: "openai",
        key: "test-key",
      }),
      model: expect.objectContaining({
        id: "fast",
        provider: "openai",
        name: "gpt-4o-mini",
      }),
      generation: {
        temperature: 0.2,
        thinking: ThinkingLevel.Low,
      },
      tools: [],
    }));
    expect(capturedRequests[0]!.messages.map((message) => message.type)).toEqual([
      MessageType.System,
      MessageType.User,
    ]);
    expect(capturedRequests[0]!.messages[1]!.content).toContain("message 1");
    expect(compressor.getSummary()).toBe("summary text");
  });

  it("keeps generated request provider mutations isolated from compressor config", async () => {
    const capturedRequests: LLMGenerateRequest[] = [];
    const llm: LLMRequest = {
      getEngineModels: () => [createResolvedModel()],
      async *streamInvoke(request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
        capturedRequests.push(request);
        yield textChunk("summary");
      },
    };
    const compressor = new ContextCompressor({ maxMessages: 3, keepRecent: 1 });

    await compressor.setLLMRequest(llm);
    await compressor.setConfig(createConfig({
      providers: [
        {
          provider: "openai",
          key: "test-key",
          models: [{ id: "fast", name: "gpt-4o-mini" }],
        },
      ],
    }));
    compressor.updateMessages(createMessages(4));
    await compressor.maybeCompress();

    capturedRequests[0]!.provider.key = "mutated-key";
    capturedRequests[0]!.provider.models![0]!.name = "mutated-model";
    compressor.updateMessages(createMessages(5));
    await compressor.maybeCompress();

    expect(capturedRequests).toHaveLength(2);
    expect(capturedRequests[1]!.provider).toEqual(expect.objectContaining({
      provider: "openai",
      key: "test-key",
      models: [{ id: "fast", name: "gpt-4o-mini" }],
    }));
  });

  it("applies default generation config when config has no generation", async () => {
    const capturedRequests: LLMGenerateRequest[] = [];
    const llm: LLMRequest = {
      getEngineModels: () => [createResolvedModel()],
      async *streamInvoke(request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
        capturedRequests.push(request);
        yield textChunk("default summary");
      },
    };
    const compressor = new ContextCompressor({ maxMessages: 3, keepRecent: 1 });

    await compressor.setLLMRequest(llm);
    await compressor.setConfig(createConfig());
    compressor.updateMessages(createMessages(4));

    await compressor.maybeCompress();

    expect(capturedRequests[0]!.generation).toEqual({
      temperature: 0.7,
      thinking: ThinkingLevel.Medium,
    });
  });

  it("skips compression when no configured model can resolve", async () => {
    let streamInvokeCount = 0;
    const llm: LLMRequest = {
      getEngineModels: () => [],
      async *streamInvoke(_request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
        streamInvokeCount += 1;
        yield textChunk("should not run");
      },
    };
    const compressor = new ContextCompressor({ maxMessages: 3, keepRecent: 1 });

    await compressor.setLLMRequest(llm);
    await compressor.setConfig({
      providers: [{ provider: "openai", key: "test-key" }],
      plugins: new Map(),
      paths: { sessiondir: "test-session" },
    });
    compressor.updateMessages(createMessages(4));

    await compressor.maybeCompress();

    expect(streamInvokeCount).toBe(0);
    expect(compressor.getCompressedCount()).toBe(0);
    expect(await compressor.collect()).toEqual([]);
  });

  it("falls back to truncated text summary on stream failure", async () => {
    const llm: LLMRequest = {
      getEngineModels: () => [createResolvedModel()],
      async *streamInvoke(_request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
        yield textChunk("partial summary");
        throw new Error("stream failed");
      },
    };
    const compressor = new ContextCompressor({ maxMessages: 3, keepRecent: 1 });

    await compressor.setLLMRequest(llm);
    await compressor.setConfig(createConfig());
    compressor.updateMessages([
      userMessage("user-1", "a".repeat(250)),
      userMessage("user-2", "important detail"),
      userMessage("user-3", "another detail"),
      userMessage("user-4", "recent detail"),
    ]);

    await compressor.maybeCompress();

    expect(compressor.getSummary()).toContain(`[${MessageType.User}]: ${"a".repeat(200)}`);
    expect(compressor.getSummary()).toContain(`[${MessageType.User}]: important detail`);
    expect(compressor.getSummary()).not.toContain("recent detail");
    expect(compressor.getCompressedCount()).toBe(3);
  });

  it("falls back when stream yields no text", async () => {
    const llm: LLMRequest = {
      getEngineModels: () => [createResolvedModel()],
      async *streamInvoke(_request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
        yield {
          type: LLMStreamChunkType.ReasoningDelta,
          text: "reasoning only",
        };
      },
    };
    const compressor = new ContextCompressor({ maxMessages: 3, keepRecent: 1 });

    await compressor.setLLMRequest(llm);
    await compressor.setConfig(createConfig());
    compressor.updateMessages(createMessages(4));

    await compressor.maybeCompress();

    expect(compressor.getSummary()).toContain(`[${MessageType.User}]: message 1`);
    expect(compressor.getCompressedCount()).toBe(3);
    expect(await compressor.collect()).toEqual([
      expect.objectContaining({
        type: MessageType.System,
        content: expect.stringContaining("message 1"),
      }),
    ]);
  });
});

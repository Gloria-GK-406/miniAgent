import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { MiniAgent } from "./agent.js";
import { LLMStreamChunkType, MessageType } from "./types.js";
import type {
  AgentContextControl,
  LLMRequest,
  Message,
  MessageChunk,
  ToolCallMessage,
  ToolResultMessage,
  TurnContext,
} from "./types.js";
import { ThinkingLevel } from "./config.js";
import type {
  AgentConfig,
  LLMGenerateRequest,
} from "./config.js";
import type { Tool } from "./tool.js";
import type { OneShotLLMFactory } from "./one-shot-llm.js";
import { TokenUsageCounter } from "./token-usage.js";

function userMessage(id = "user-1"): Message {
  return {
    id,
    type: MessageType.User,
    content: "hello",
  };
}

function chunkText(text: string): MessageChunk {
  return {
    type: LLMStreamChunkType.TextDelta,
    text,
  };
}

function createConfig(sessiondir: string, overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    paths: { sessiondir },
    ...overrides,
  };
}

function createLLM(options: {
  chunks?: MessageChunk[];
  responses?: MessageChunk[][];
  onRequest?: (request: LLMGenerateRequest) => void;
} = {}): LLMRequest {
  return {
    async *streamInvoke(request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
      options.onRequest?.(request);
      const chunks = options.responses?.shift() ?? options.chunks ?? [chunkText("done")];
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

function setTestModel(agent: MiniAgent): void {
  agent.setModel({
    provider: "test",
    key: "test-key",
    model: {
      name: "test-model",
      thinkingLevels: [ThinkingLevel.None],
    },
  });
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("MiniAgent", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "miniagent-agent-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("injects fresh one-shot callers and shares token usage through the service", async () => {
    const requests: LLMGenerateRequest[] = [];
    const usage = new TokenUsageCounter();
    const agent = new MiniAgent({
      llm: createLLM({
        chunks: [
          chunkText("done"),
          {
            type: LLMStreamChunkType.Usage,
            tokenCount: { input: 5, output: 2, total: 7 },
          },
        ],
        onRequest: (request) => requests.push(request),
      }),
      config: createConfig(testDir),
      tokenUsage: usage,
    });
    let factory: OneShotLLMFactory | undefined;
    agent.register({
      setOneShotLLMFactory(value: OneShotLLMFactory): void {
        factory = value;
      },
    });
    setTestModel(agent);

    await agent.run(userMessage());
    const oneShot = factory!.create();
    await oneShot.invoke([userMessage("internal")]);

    expect(requests).toHaveLength(2);
    expect(requests[1]!.tools).toEqual([]);
    expect(agent.getContextCount()).toEqual({ input: 10, output: 4, total: 14 });
    agent.resetContextCount();
    expect(agent.getContextCount()).toEqual({ input: 0, output: 0, total: 0 });
  });

  it("does not treat setConfig-only objects as registrable modules", () => {
    const agent = new MiniAgent({
      llm: createLLM(),
      config: createConfig(testDir),
    });
    const setConfigOnly = {
      setConfig: async (): Promise<void> => {},
    };

    expect(() => agent.register(setConfigOnly as never)).toThrow(
      "Unsupported agent registration item",
    );
  });

  it("destroys registered destroyable modules once in reverse registration order", async () => {
    const agent = new MiniAgent({
      llm: createLLM(),
      config: createConfig(testDir),
    });
    const destroyed: string[] = [];

    const first = {
      destroy: async (): Promise<void> => {
        destroyed.push("first");
      },
    };
    const second = {
      destroy: async (): Promise<void> => {
        await Promise.resolve();
        destroyed.push("second");
      },
    };

    agent.register(first);
    agent.register(first);
    agent.register(second);

    await agent.destroy();
    await agent.destroy();

    expect(destroyed).toEqual(["second", "first"]);
  });

  it("waits for an active run to settle before destroying registered modules", async () => {
    const streamStarted = deferred<void>();
    const releaseStream = deferred<void>();
    const llm: LLMRequest = {
      async *streamInvoke(): AsyncGenerator<MessageChunk> {
        streamStarted.resolve();
        await releaseStream.promise;
        yield chunkText("done");
      },
    };
    const agent = new MiniAgent({
      llm,
      config: createConfig(testDir),
    });
    let runSettled = false;
    const destroyed: string[] = [];
    agent.register({
      destroy: async (): Promise<void> => {
        destroyed.push(runSettled ? "after-run" : "before-run");
      },
    });

    setTestModel(agent);
    const runPromise = agent.run(userMessage()).finally(() => {
      runSettled = true;
    });
    await streamStarted.promise;

    let destroySettled = false;
    const destroyPromise = agent.destroy().then(() => {
      destroySettled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(destroySettled).toBe(false);
    expect(destroyed).toEqual([]);

    releaseStream.resolve();
    await destroyPromise;
    await runPromise;

    expect(destroyed).toEqual(["after-run"]);
  });

  it("rejects run, register, and execute after destroy", async () => {
    const agent = new MiniAgent({
      llm: createLLM(),
      config: createConfig(testDir),
    });

    await agent.destroy();

    expect(() => agent.register({ destroy: async (): Promise<void> => {} }))
      .toThrow("Agent has been destroyed.");
    await expect(agent.run(userMessage("after-destroy")))
      .rejects.toThrow("Agent has been destroyed.");
    await expect(agent.execute({
      id: "toolcall-1",
      type: MessageType.ToolCall,
      content: "",
      toolCallId: "call-1",
      toolName: "missing",
      arguments: {},
    })).rejects.toThrow("Agent has been destroyed.");
  });

  it("publishes the real turn context after buildContext", async () => {
    const seenContexts: TurnContext[] = [];
    const seenRequests: LLMGenerateRequest[] = [];
    const agent = new MiniAgent({
      llm: createLLM({
        onRequest: (request) => {
          seenRequests.push(request);
        },
      }),
      config: createConfig(testDir),
    });

    agent.register({
      appendTurnContext: async (): Promise<Message[]> => [
        {
          id: "append-1",
          type: MessageType.System,
          content: "prepended",
        },
      ],
    });
    agent.register({
      priority: 0,
      collect: async (): Promise<Message[]> => [
        {
          id: "provider-1",
          type: MessageType.System,
          content: "provided",
        },
      ],
    });
    agent.register({
      consumeTurnContext: async (context: TurnContext): Promise<void> => {
        seenContexts.push(context);
      },
    });

    setTestModel(agent);
    const messages = await agent.run(userMessage());

    expect(seenContexts).toHaveLength(1);
    expect(seenContexts[0]!.turn).toBe(1);
    expect(seenContexts[0]!.context).toEqual(seenRequests[0]!.messages);
    expect(seenContexts[0]!.context.map((message) => message.id)).toEqual([
      "append-1",
      "provider-1",
      "user-1",
    ]);
    expect(messages.map((message) => message.id)).toEqual(["user-1", expect.any(String)]);
  });

  it("exposes managed context APIs without exposing MessageSource", async () => {
    const agent = new MiniAgent({
      llm: createLLM({ chunks: [chunkText("done")] }),
      config: createConfig(testDir),
    });

    agent.register({
      appendTurnContext: async (): Promise<Message[]> => [
        {
          id: "append-1",
          type: MessageType.System,
          content: "prepended",
        },
      ],
    });

    setTestModel(agent);
    await agent.run(userMessage());

    expect((await agent.getMessages()).map((message) => message.content)).toEqual([
      "hello",
      "done",
    ]);
    expect((await agent.previewContext()).map((message) => message.id)).toEqual([
      "append-1",
      "user-1",
      expect.any(String),
    ]);

    await agent.setDiscardBefore("user-1");
    expect((await agent.getMessages()).map((message) => message.content)).toEqual(["done"]);

    await agent.clearDiscardBefore();
    expect((await agent.getMessages()).map((message) => message.content)).toEqual([
      "hello",
      "done",
    ]);
  });

  it("emits tool results normally when tools complete", async () => {
    const seenResults: ToolResultMessage[] = [];
    const toolCallChunks: MessageChunk[] = [
      {
        type: LLMStreamChunkType.ToolCallArgumentsDelta,
        index: 0,
        argsText: "{\"text\":\"pong\"}",
        toolCallId: "call-1",
        toolName: "echo_tool",
      },
    ];
    const agent = new MiniAgent({
      llm: createLLM({
        responses: [
          [toolCallChunks[0]!],
          [chunkText("done")],
        ],
      }),
      config: createConfig(testDir),
    });
    const tool: Tool = {
      name: "echo_tool",
      description: "Echoes text",
      parameters: z.object({
        text: z.string(),
      }),
      execute: async (args: Record<string, unknown>): Promise<string> => String(args["text"]),
    };

    agent.register(tool);
    agent.on("tool:result", ({ result }: { toolCall: ToolCallMessage; result: ToolResultMessage }) => {
      seenResults.push(result);
    });

    setTestModel(agent);
    const messages = await agent.run(userMessage());

    expect(seenResults).toHaveLength(1);
    expect(seenResults[0]!.content).toBe("pong");
    expect(messages.map((message) => message.type)).toEqual([
      MessageType.User,
      MessageType.ToolCall,
      MessageType.ToolResult,
      MessageType.Assist,
    ]);
  });

  it("rejects invalid tool arguments before approval and execution", async () => {
    const requestApproval = vi.fn(async () => true);
    const execute = vi.fn(async () => "unexpected");
    const agent = new MiniAgent({
      llm: createLLM({
        responses: [
          [{
            type: LLMStreamChunkType.ToolCallArgumentsDelta,
            index: 0,
            argsText: "{\"count\":\"not-a-number\"}",
            toolCallId: "call-invalid",
            toolName: "validated_tool",
          }],
          [chunkText("done")],
        ],
      }),
      config: createConfig(testDir),
    });
    agent.register({
      name: "validated_tool",
      description: "Requires a number",
      parameters: z.object({ count: z.number() }),
      execute,
    });
    agent.register({ requestApproval });

    setTestModel(agent);
    const messages = await agent.run(userMessage());

    expect(requestApproval).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(messages).toContainEqual(expect.objectContaining({
      type: MessageType.ToolResult,
      toolCallId: "call-invalid",
    }));
  });

  it("shares one parsed tool argument value with approval and execution", async () => {
    const approvedArgs: Record<string, unknown>[] = [];
    const executedArgs: Record<string, unknown>[] = [];
    const agent = new MiniAgent({
      llm: createLLM({
        responses: [
          [{
            type: LLMStreamChunkType.ToolCallArgumentsDelta,
            index: 0,
            argsText: "{\"text\":\"  hello  \"}",
            toolCallId: "call-transformed",
            toolName: "transform_tool",
          }],
          [chunkText("done")],
        ],
      }),
      config: createConfig(testDir),
    });
    agent.register({
      name: "transform_tool",
      description: "Transforms arguments",
      parameters: z.object({
        text: z.string().trim(),
        count: z.number().default(2),
      }),
      execute: async (args) => {
        executedArgs.push(args);
        return "ok";
      },
    });
    agent.register({
      requestApproval: async (_toolName, args) => {
        approvedArgs.push(args);
        return true;
      },
    });

    setTestModel(agent);
    await agent.run(userMessage());

    expect(approvedArgs).toEqual([{ text: "hello", count: 2 }]);
    expect(executedArgs).toEqual(approvedArgs);
    expect(executedArgs[0]).toBe(approvedArgs[0]);
  });

  it("does not request approval for a missing tool", async () => {
    const requestApproval = vi.fn(async () => true);
    const agent = new MiniAgent({
      llm: createLLM({
        responses: [
          [{
            type: LLMStreamChunkType.ToolCallArgumentsDelta,
            index: 0,
            argsText: "{}",
            toolCallId: "call-missing",
            toolName: "missing_tool",
          }],
          [chunkText("done")],
        ],
      }),
      config: createConfig(testDir),
    });
    agent.register({ requestApproval });

    setTestModel(agent);
    const messages = await agent.run(userMessage());

    expect(requestApproval).not.toHaveBeenCalled();
    expect(messages).toContainEqual(expect.objectContaining({
      type: MessageType.ToolResult,
      content: "tool not found: missing_tool",
    }));
  });

  it("does not execute registered tools outside the current turn tool map", async () => {
    const execute = vi.fn(async () => "unexpected");
    const agent = new MiniAgent({
      llm: createLLM(),
      config: createConfig(testDir),
    });
    agent.register({
      name: "pre_turn_tool",
      description: "Must be selected for the current turn before execution",
      parameters: z.object({ text: z.string() }),
      execute,
    });

    const result = await agent.execute({
      id: "pre-turn-message",
      type: MessageType.ToolCall,
      content: "",
      toolCallId: "pre-turn-call",
      toolName: "pre_turn_tool",
      arguments: { text: "blocked" },
    });

    expect(result.content).toBe("tool not found: pre_turn_tool");
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes a managed control surface to after-turn processors", async () => {
    let seenControl: AgentContextControl | undefined;
    const agent = new MiniAgent({
      llm: createLLM({ chunks: [chunkText("done")] }),
      config: createConfig(testDir),
    });

    agent.register({
      priority: 0,
      process: async (control: AgentContextControl, input: Message): Promise<void> => {
        seenControl = control;
        expect(input.id).toBe("user-1");
        expect((await control.getMessages()).map((message) => message.content)).toEqual([
          "hello",
          "done",
        ]);
        await control.setDiscardBefore("user-1");
      },
    });

    setTestModel(agent);
    const messages = await agent.run(userMessage());

    expect(seenControl).toBeDefined();
    expect(messages.map((message) => message.content)).toEqual(["done"]);
  });
});

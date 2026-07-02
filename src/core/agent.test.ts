import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { MiniAgent } from "./agent.js";
import { DefaultLLMEngineRegister } from "./llm.js";
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
  ModelPreset,
  ResolvedModel,
} from "./config.js";
import type { LLMEngine } from "./llm.js";
import type { Tool } from "../tool/types.js";

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
    providers: [
      {
        provider: "test",
        key: "test-key",
        models: [{ id: "test-model", name: "test-model" }],
      },
    ],
    paths: { sessiondir },
    ...overrides,
  };
}

function cloneResolvedModel(model: ResolvedModel): ResolvedModel {
  return {
    ...model,
    thinkingLevels: [...model.thinkingLevels],
    ...(model.capabilities !== undefined && {
      capabilities: structuredClone(model.capabilities),
    }),
    ...(model.metadata !== undefined && {
      metadata: structuredClone(model.metadata),
    }),
  };
}

function createLLM(options: {
  models?: Record<string, ResolvedModel[]>;
  chunks?: MessageChunk[];
  responses?: MessageChunk[][];
  onRequest?: (request: LLMGenerateRequest) => void;
} = {}): LLMRequest {
  return {
    getEngineModels(engineName: string): ResolvedModel[] {
      return options.models?.[engineName]?.map(cloneResolvedModel) ?? [];
    },
    async *streamInvoke(request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
      options.onRequest?.(request);
      const chunks = options.responses?.shift() ?? options.chunks ?? [chunkText("done")];
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
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

function fakeEngine(
  name: string,
  models: ModelPreset[],
  options: {
    chunks?: MessageChunk[];
    onRequest?: (request: LLMGenerateRequest) => void;
  } = {},
): LLMEngine {
  return {
    name,
    getModels: () => models,
    async *streamGenerate(request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
      options.onRequest?.(request);
      for (const chunk of options.chunks ?? [chunkText(request.model.name)]) {
        yield chunk;
      }
    },
  };
}

describe("MiniAgent", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "miniagent-agent-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("aggregates resolved models from registered engines and provider overrides", () => {
    const llm = new DefaultLLMEngineRegister();
    llm.register(fakeEngine("openai", [
      {
        id: "gpt-4o-mini",
        name: "gpt-4o-mini",
        contextSize: 128000,
        maxOutputTokens: 16384,
        thinkingLevels: [ThinkingLevel.None],
      },
    ]));

    const agent = new MiniAgent({
      llm,
      config: createConfig(testDir, {
        providers: [
          {
            provider: "openai",
            key: "test-key",
            models: [
              {
                id: "fast",
                name: "gpt-4o-mini",
                contextSize: 64000,
              },
            ],
          },
        ],
      }),
    });

    expect(agent.getModels()).toEqual([
      expect.objectContaining({
        id: "fast",
        provider: "openai",
        name: "gpt-4o-mini",
        contextSize: 64000,
        maxOutputTokens: 16384,
      }),
    ]);
  });

  it("setResolvedModel only changes the selected model and leaves default generation config", () => {
    const llm = new DefaultLLMEngineRegister();
    llm.register(fakeEngine("openai", [
      { id: "slow", name: "gpt-4o", thinkingLevels: [ThinkingLevel.None] },
      { id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] },
    ]));
    const agent = new MiniAgent({
      llm,
      config: createConfig(testDir, {
        providers: [{ provider: "openai", key: "test-key" }],
        defaultModel: { id: "slow" },
      }),
    });

    agent.setResolvedModel({ id: "fast" });

    expect(agent.getCurrentResolvedModel()).toEqual(expect.objectContaining({
      id: "fast",
      name: "gpt-4o-mini",
    }));
    expect(agent.getGenerationConfig()).toEqual({
      temperature: 0.7,
      thinking: ThinkingLevel.Medium,
    });
  });

  it("setGenerationConfig only changes generation config", () => {
    const llm = new DefaultLLMEngineRegister();
    llm.register(fakeEngine("openai", [
      { id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] },
    ]));
    const agent = new MiniAgent({
      llm,
      config: createConfig(testDir, {
        providers: [{ provider: "openai", key: "test-key" }],
        defaultModel: { id: "fast" },
      }),
    });

    agent.setGenerationConfig({
      temperature: 0.1,
      thinking: ThinkingLevel.High,
    });

    expect(agent.getCurrentResolvedModel()).toEqual(expect.objectContaining({
      id: "fast",
      name: "gpt-4o-mini",
    }));
    expect(agent.getGenerationConfig()).toEqual({
      temperature: 0.1,
      thinking: ThinkingLevel.High,
    });
  });

  it("setGenerationConfig merges partial updates over the current generation config", () => {
    const llm = new DefaultLLMEngineRegister();
    llm.register(fakeEngine("openai", [
      { id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] },
    ]));
    const agent = new MiniAgent({
      llm,
      config: createConfig(testDir, {
        providers: [{ provider: "openai", key: "test-key" }],
        defaultModel: { id: "fast" },
        generation: { temperature: 0.2, thinking: ThinkingLevel.Low },
      }),
    });

    agent.setGenerationConfig({ topP: 0.8 });

    expect(agent.getGenerationConfig()).toEqual({
      temperature: 0.2,
      topP: 0.8,
      thinking: ThinkingLevel.Low,
    });
    expect(agent.getCurrentResolvedModel()).toEqual(expect.objectContaining({
      id: "fast",
      name: "gpt-4o-mini",
    }));
  });

  it("does not expose legacy model APIs", () => {
    const agent = new MiniAgent({
      llm: createLLM(),
      config: createConfig(testDir),
    });
    const exposed = agent as unknown as Record<string, unknown>;
    const removedMethods = [
      "set" + "Model",
      "get" + "Current" + "Model",
      "get" + "ModelList",
      "set" + "ModelByPath",
    ];

    for (const name of removedMethods) {
      expect(exposed[name]).toBeUndefined();
    }
  });

  it("runs with a request-mode LLMGenerateRequest containing model and generation", async () => {
    const seenRequests: LLMGenerateRequest[] = [];
    const llm = new DefaultLLMEngineRegister();
    llm.register(fakeEngine("openai", [
      {
        id: "gpt-4o-mini",
        name: "gpt-4o-mini",
        contextSize: 128000,
        maxOutputTokens: 16384,
        thinkingLevels: [ThinkingLevel.None],
      },
    ], {
      chunks: [chunkText("done")],
      onRequest: (request) => {
        seenRequests.push(request);
      },
    }));
    const agent = new MiniAgent({
      llm,
      config: createConfig(testDir, {
        providers: [
          {
            provider: "openai",
            key: "test-key",
            models: [{ id: "fast", name: "gpt-4o-mini" }],
          },
        ],
        defaultModel: { id: "fast" },
        generation: { temperature: 0.2, thinking: ThinkingLevel.Low },
      }),
    });

    const messages = await agent.run(userMessage());

    expect(seenRequests).toHaveLength(1);
    expect(seenRequests[0]).toEqual(expect.objectContaining({
      provider: expect.objectContaining({
        provider: "openai",
        key: "test-key",
      }),
      model: expect.objectContaining({
        id: "fast",
        provider: "openai",
        name: "gpt-4o-mini",
        maxOutputTokens: 16384,
      }),
      generation: {
        temperature: 0.2,
        thinking: ThinkingLevel.Low,
      },
    }));
    expect(seenRequests[0]!.messages.map((message) => message.id)).toEqual(["user-1"]);
    expect(messages.map((message) => message.content)).toEqual(["hello", "done"]);
  });

  it("throws before generation when no model is available", async () => {
    const seenRequests: LLMGenerateRequest[] = [];
    const agent = new MiniAgent({
      llm: createLLM({
        onRequest: (request) => {
          seenRequests.push(request);
        },
      }),
      config: createConfig(testDir, {
        providers: [],
      }),
    });

    await expect(agent.run(userMessage())).rejects.toThrow(
      "No model is available. Configure providers or register engine models first.",
    );
    expect(seenRequests).toEqual([]);
  });

  it("updates provider-only config snapshots when selecting a resolved model", () => {
    const llm = new DefaultLLMEngineRegister();
    llm.register(fakeEngine("openai", [
      { id: "slow", name: "gpt-4o", thinkingLevels: [ThinkingLevel.None] },
      { id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] },
    ]));
    const agent = new MiniAgent({
      llm,
      config: createConfig(testDir, {
        providers: [{ provider: "openai", key: "test-key" }],
        defaultModel: { id: "slow" },
      }),
    });

    agent.setResolvedModel({ id: "fast" });

    const latest = agent.getConfig() as AgentConfig & Record<string, unknown>;
    expect(latest.defaultModel).toEqual({
      id: "fast",
      provider: "openai",
    });
    expect(latest.providers).toEqual([
      expect.objectContaining({ provider: "openai", key: "test-key" }),
    ]);
    expect(latest["model"]).toBeUndefined();
    expect(latest["models"]).toBeUndefined();
    expect(latest["plugins"]).toBeUndefined();
  });

  it("preserves aliased resolved model ids in config snapshots", () => {
    const llm = new DefaultLLMEngineRegister();
    llm.register(fakeEngine("openai", [
      { id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] },
      { id: "balanced", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] },
    ]));
    const agent = new MiniAgent({
      llm,
      config: createConfig(testDir, {
        providers: [{ provider: "openai", key: "test-key" }],
        defaultModel: { id: "fast", provider: "openai" },
      }),
    });

    agent.setResolvedModel({ id: "balanced", provider: "openai" });

    expect(agent.getCurrentResolvedModel()).toEqual(expect.objectContaining({
      id: "balanced",
      name: "gpt-4o-mini",
    }));
    expect(agent.getConfig().defaultModel).toEqual({
      id: "balanced",
      provider: "openai",
    });
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
      getEngineModels: () => [],
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

    const messages = await agent.run(userMessage());

    expect(seenControl).toBeDefined();
    expect(messages.map((message) => message.content)).toEqual(["done"]);
  });
});

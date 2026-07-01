import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { MiniAgent } from "./agent.js";
import { StopException } from "./errors.js";
import { MessageType } from "./types.js";
import type {
  AgentContextControl,
  ModelAwareLLMRequest,
  LLMRequest,
  LLMMessageResponse,
  LLMResponse,
  LLMStreamHandle,
  Message,
  ToolCallMessage,
  ToolResultMessage,
  TurnContext,
} from "./types.js";
import { ThinkingLevel } from "./config.js";
import type {
  AgentConfig,
  LLMGenerateRequest,
  ModelConfig,
  ModelPreset,
} from "./config.js";
import type { Tool } from "../tool/types.js";
function createConfig(basepersistdir: string): AgentConfig {
  return {
    model: {
      provider: "test",
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "http://localhost",
    },
    models: new Map(),
    plugins: new Map(),
    paths: { sessiondir: basepersistdir },
  };
}

function createProviderConfig(basepersistdir: string): AgentConfig {
  return {
    providers: [
      {
        name: "test-main",
        engine: "test-engine",
        apiKey: "test-key",
        models: {
          add: [
            {
              model: "custom-model",
              contextSize: 32000,
              maxOutputTokens: 4096,
              thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
            },
          ],
        },
      },
    ],
    defaultModel: { id: "test-main/custom-model" },
    generation: { temperature: 0.2, thinking: ThinkingLevel.None },
    models: new Map(),
    plugins: new Map(),
    paths: { sessiondir: basepersistdir },
  };
}

function createResolvedHandle<T>(value: T): LLMStreamHandle<T> {
  return {
    onChunk: () => () => void 0,
    abort: () => void 0,
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(value).then(onfulfilled, onrejected);
    },
  };
}

function wrapResponse(message: LLMMessageResponse, input = 0, output = 0): LLMResponse {
  return {
    message,
    tokenCount: {
      input,
      output,
      total: input + output,
    },
  };
}

function createLLM(responses: LLMResponse[], onInvoke?: (messages: Message[]) => void): LLMRequest {
  return {
    streamInvoke(messages: Message[]): LLMStreamHandle<LLMResponse> {
      onInvoke?.(messages);
      const next = responses.shift();
      if (!next) {
        throw new Error("No response queued");
      }
      return createResolvedHandle(next);
    },
  };
}

function createModelAwareLLM(
  responses: LLMResponse[],
  catalogs: Record<string, ModelPreset[]>,
  onRequest?: (request: LLMGenerateRequest) => void,
): ModelAwareLLMRequest {
  return {
    getEngineModels(engineName: string): ModelPreset[] {
      return catalogs[engineName]?.map((model) => ({
        ...model,
        thinkingLevels: [...model.thinkingLevels],
      })) ?? [];
    },
    streamInvoke(
      requestOrMessages: LLMGenerateRequest | Message[],
      _config?: ModelConfig,
      _tools?: Tool[],
    ): LLMStreamHandle<LLMResponse> {
      if (Array.isArray(requestOrMessages)) {
        throw new Error("Expected request-object streamInvoke");
      }
      onRequest?.(requestOrMessages);
      const next = responses.shift();
      if (!next) {
        throw new Error("No response queued");
      }
      return createResolvedHandle(next);
    },
  } as ModelAwareLLMRequest;
}

describe("MiniAgent", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "miniagent-agent-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("aggregates provider-added models and exposes the current model", () => {
    const agent = new MiniAgent(createLLM([]), createProviderConfig(testDir));

    expect(agent.getModels()).toEqual([
      {
        id: "test-main/custom-model",
        provider: "test-main",
        engine: "test-engine",
        model: "custom-model",
        contextSize: 32000,
        maxOutputTokens: 4096,
        thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
      },
    ]);
    expect(agent.getCurrentModel().id).toBe("test-main/custom-model");
  });

  it("aggregates engine catalog models and applies provider overrides", () => {
    const agent = new MiniAgent(
      createModelAwareLLM([], {
        "test-engine": [
          {
            model: "catalog-a",
            displayName: "Catalog A",
            contextSize: 16000,
            maxOutputTokens: 1024,
            thinkingLevels: [ThinkingLevel.None],
          },
          {
            model: "catalog-b",
            displayName: "Catalog B",
            contextSize: 32000,
            maxOutputTokens: 2048,
            thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
          },
        ],
      }),
      {
        providers: [
          {
            name: "test-main",
            engine: "test-engine",
            apiKey: "test-key",
            models: {
              add: [
                {
                  model: "custom-model",
                  contextSize: 64000,
                  thinkingLevels: [ThinkingLevel.None, ThinkingLevel.High],
                },
              ],
              override: {
                "catalog-b": {
                  displayName: "Catalog B Override",
                  contextSize: 48000,
                },
              },
            },
          },
        ],
        defaultModel: { id: "test-main/catalog-b" },
        models: new Map(),
        plugins: new Map(),
        paths: { sessiondir: testDir },
      },
    );

    expect(agent.getModels()).toEqual([
      {
        id: "test-main/catalog-a",
        provider: "test-main",
        engine: "test-engine",
        model: "catalog-a",
        displayName: "Catalog A",
        contextSize: 16000,
        maxOutputTokens: 1024,
        thinkingLevels: [ThinkingLevel.None],
      },
      {
        id: "test-main/catalog-b",
        provider: "test-main",
        engine: "test-engine",
        model: "catalog-b",
        displayName: "Catalog B Override",
        contextSize: 48000,
        maxOutputTokens: 2048,
        thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
      },
      {
        id: "test-main/custom-model",
        provider: "test-main",
        engine: "test-engine",
        model: "custom-model",
        contextSize: 64000,
        thinkingLevels: [ThinkingLevel.None, ThinkingLevel.High],
      },
    ]);
    expect(agent.getCurrentModel().id).toBe("test-main/catalog-b");
  });

  it("sets model without changing generation config", () => {
    const agent = new MiniAgent(createLLM([]), {
      providers: [
        {
          name: "p",
          engine: "test",
          apiKey: "k",
          models: {
            add: [
              { model: "a", thinkingLevels: [ThinkingLevel.None] },
              { model: "b", thinkingLevels: [ThinkingLevel.None] },
            ],
          },
        },
      ],
      defaultModel: { id: "p/a" },
      generation: { temperature: 0.3, thinking: ThinkingLevel.High },
      models: new Map(),
      plugins: new Map(),
      paths: { sessiondir: testDir },
    });

    agent.setModel({ id: "p/b" });

    expect(agent.getCurrentModel().id).toBe("p/b");
    expect(agent.getGenerationConfig()).toEqual({
      temperature: 0.3,
      thinking: ThinkingLevel.High,
    });
  });

  it("merges generation config updates", () => {
    const agent = new MiniAgent(createLLM([]), createProviderConfig(testDir));

    agent.setGenerationConfig({ thinking: ThinkingLevel.Max });

    expect(agent.getGenerationConfig()).toEqual({
      temperature: 0.2,
      thinking: ThinkingLevel.Max,
    });
    expect(agent.getCurrentModel().id).toBe("test-main/custom-model");
  });

  it("runs through request-object streamInvoke when the LLM is model-aware", async () => {
    const seenRequests: LLMGenerateRequest[] = [];
    const agent = new MiniAgent(
      createModelAwareLLM(
        [
          wrapResponse({
            id: "assist-1",
            type: MessageType.Assist,
            content: "done",
          }),
        ],
        {
          "test-engine": [
            {
              model: "catalog-model",
              contextSize: 128000,
              maxOutputTokens: 8192,
              thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
            },
          ],
        },
        (request) => {
          seenRequests.push(request);
        },
      ),
      {
        providers: [
          {
            name: "test-main",
            engine: "test-engine",
            apiKey: "test-key",
            baseUrl: "http://localhost",
          },
        ],
        defaultModel: { id: "test-main/catalog-model" },
        generation: { temperature: 0.4, thinking: ThinkingLevel.Medium },
        models: new Map(),
        plugins: new Map(),
        paths: { sessiondir: testDir },
      },
    );

    const messages = await agent.run({
      id: "user-1",
      type: MessageType.User,
      content: "hello",
    });

    expect(messages.map((message) => message.id)).toEqual(["user-1", "assist-1"]);
    expect(seenRequests).toHaveLength(1);
    expect(seenRequests[0]!.provider).toMatchObject({
      name: "test-main",
      engine: "test-engine",
      apiKey: "test-key",
      baseUrl: "http://localhost",
    });
    expect(seenRequests[0]!.model.id).toBe("test-main/catalog-model");
    expect(seenRequests[0]!.generation).toEqual({
      temperature: 0.4,
      thinking: ThinkingLevel.Medium,
    });
    expect(seenRequests[0]!.messages.map((message) => message.id)).toEqual(["user-1"]);
  });

  it("publishes the real turn context after buildContext", async () => {
    const seenContexts: TurnContext[] = [];
    const seenRequests: Message[][] = [];
    const llm = createLLM(
      [
        wrapResponse({
          id: "assist-1",
          type: MessageType.Assist,
          content: "done",
        }),
      ],
      (messages) => {
        seenRequests.push(messages);
      },
    );
    const agent = new MiniAgent(llm, createConfig(testDir));

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

    const messages = await agent.run({
      id: "user-1",
      type: MessageType.User,
      content: "hello",
    });

    expect(seenContexts).toHaveLength(1);
    expect(seenContexts[0]!.turn).toBe(1);
    expect(seenContexts[0]!.context).toEqual(seenRequests[0]);
    expect(seenContexts[0]!.context.map((message) => message.id)).toEqual([
      "append-1",
      "provider-1",
      "user-1",
    ]);
    expect(messages.map((message) => message.id)).toEqual(["user-1", "assist-1"]);
  });

  it("exposes managed context APIs without exposing MessageSource", async () => {
    const llm = createLLM([
      wrapResponse({
        id: "assist-1",
        type: MessageType.Assist,
        content: "done",
      }),
    ]);
    const agent = new MiniAgent(llm, createConfig(testDir));

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

    await agent.run({
      id: "user-1",
      type: MessageType.User,
      content: "hello",
    });

    expect((await agent.getMessages()).map((message) => message.id)).toEqual([
      "user-1",
      "assist-1",
    ]);
    expect((await agent.previewContext()).map((message) => message.id)).toEqual([
      "append-1",
      "provider-1",
      "user-1",
      "assist-1",
    ]);

    await agent.setDiscardBefore("user-1");
    expect((await agent.getMessages()).map((message) => message.id)).toEqual(["assist-1"]);

    await agent.clearDiscardBefore();
    expect((await agent.getMessages()).map((message) => message.id)).toEqual([
      "user-1",
      "assist-1",
    ]);
  });

  it("stops the loop when a tool throws StopException", async () => {
    const onStop = vi.fn();
    const toolCall: ToolCallMessage = {
      id: "tool-call-1",
      type: MessageType.ToolCall,
      content: "",
      toolCallId: "call-1",
      toolName: "stop_tool",
      arguments: {},
    };
    const llm = createLLM([wrapResponse([toolCall])]);
    const agent = new MiniAgent(llm, createConfig(testDir));
    const tool: Tool = {
      name: "stop_tool",
      description: "Stop the agent",
      parameters: z.object({}),
      execute: async (): Promise<string> => {
        throw new StopException("stop now");
      },
    };

    agent.register(tool);
    agent.on("run:stop", onStop);

    const messages = await agent.run({
      id: "user-1",
      type: MessageType.User,
      content: "please stop",
    });

    expect(onStop).toHaveBeenCalledOnce();
    expect(messages.map((message) => message.id)).toEqual(["user-1", "tool-call-1"]);
  });

  it("emits tool results normally when tools complete", async () => {
    const seenResults: ToolResultMessage[] = [];
    const toolCall: ToolCallMessage = {
      id: "tool-call-1",
      type: MessageType.ToolCall,
      content: "",
      toolCallId: "call-1",
      toolName: "echo_tool",
      arguments: { text: "pong" },
    };
    const llm = createLLM([
      wrapResponse([toolCall], 3, 4),
      wrapResponse({
        id: "assist-2",
        type: MessageType.Assist,
        content: "done",
      }, 5, 6),
    ]);
    const agent = new MiniAgent(llm, createConfig(testDir));
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

    const messages = await agent.run({
      id: "user-1",
      type: MessageType.User,
      content: "call the tool",
    });

    expect(seenResults).toHaveLength(1);
    expect(seenResults[0]!.content).toBe("pong");
    expect(messages.map((message) => message.id)).toEqual([
      "user-1",
      "tool-call-1",
      seenResults[0]!.id,
      "assist-2",
    ]);
    expect(agent.getContextCount()).toEqual({ input: 8, output: 10, total: 18 });
  });

  it("returns tool execution errors as tool results instead of failing the turn", async () => {
    const toolCall: ToolCallMessage = {
      id: "tool-call-1",
      type: MessageType.ToolCall,
      content: "",
      toolCallId: "call-1",
      toolName: "strict_tool",
      arguments: {},
    };
    const llm = createLLM([
      wrapResponse([toolCall]),
      wrapResponse({
        id: "assist-2",
        type: MessageType.Assist,
        content: "recovered",
      }),
    ]);
    const agent = new MiniAgent(llm, createConfig(testDir));
    const strictTool: Tool = {
      name: "strict_tool",
      description: "Requires a path",
      parameters: z.object({
        path: z.string(),
      }),
      execute: async (args: Record<string, unknown>): Promise<string> => {
        const parsed = z.object({
          path: z.string(),
        }).parse(args);
        return parsed.path;
      },
    };

    agent.register(strictTool);

    const messages = await agent.run({
      id: "user-1",
      type: MessageType.User,
      content: "call the strict tool",
    });

    const toolResult = messages.find((message) => message.type === MessageType.ToolResult) as ToolResultMessage | undefined;
    expect(toolResult).toBeDefined();
    expect(String(toolResult!.content)).toContain("\"path\"");
    expect(messages[messages.length - 1]!.id).toBe("assist-2");
  });

  it("executes a tool only after every approver allows it", async () => {
    const decisions: string[] = [];
    const toolCall: ToolCallMessage = {
      id: "tool-call-1",
      type: MessageType.ToolCall,
      content: "",
      toolCallId: "call-1",
      toolName: "echo_tool",
      arguments: { text: "pong" },
    };
    const llm = createLLM([
      wrapResponse([toolCall]),
      wrapResponse({
        id: "assist-2",
        type: MessageType.Assist,
        content: "done",
      }),
    ]);
    const agent = new MiniAgent(llm, createConfig(testDir));

    agent.register({
      requestApproval: async (): Promise<true> => {
        decisions.push("first");
        return true;
      },
    });
    agent.register({
      requestApproval: async (): Promise<true> => {
        decisions.push("second");
        return true;
      },
    });
    agent.register({
      name: "echo_tool",
      description: "Echoes text",
      parameters: z.object({
        text: z.string(),
      }),
      execute: async (args: Record<string, unknown>): Promise<string> => String(args["text"]),
    });

    const messages = await agent.run({
      id: "user-1",
      type: MessageType.User,
      content: "call the tool",
    });

    expect(decisions).toEqual(["first", "second"]);
    const toolResult = messages.find((message) => message.type === MessageType.ToolResult) as ToolResultMessage | undefined;
    expect(toolResult?.content).toBe("pong");
  });

  it("denies tool execution when any approver rejects it", async () => {
    const decisions: string[] = [];
    const toolCall: ToolCallMessage = {
      id: "tool-call-1",
      type: MessageType.ToolCall,
      content: "",
      toolCallId: "call-1",
      toolName: "echo_tool",
      arguments: { text: "pong" },
    };
    const llm = createLLM([
      wrapResponse([toolCall]),
      wrapResponse({
        id: "assist-2",
        type: MessageType.Assist,
        content: "done",
      }),
    ]);
    const agent = new MiniAgent(llm, createConfig(testDir));

    agent.register({
      requestApproval: async (): Promise<true> => {
        decisions.push("first");
        return true;
      },
    });
    agent.register({
      requestApproval: async (): Promise<false> => {
        decisions.push("second");
        return false;
      },
    });
    agent.register({
      requestApproval: async (): Promise<true> => {
        decisions.push("third");
        return true;
      },
    });
    agent.register({
      name: "echo_tool",
      description: "Echoes text",
      parameters: z.object({
        text: z.string(),
      }),
      execute: async (): Promise<string> => "pong",
    });

    const messages = await agent.run({
      id: "user-1",
      type: MessageType.User,
      content: "call the tool",
    });

    expect(decisions).toEqual(["first", "second"]);
    const toolResult = messages.find((message) => message.type === MessageType.ToolResult) as ToolResultMessage | undefined;
    expect(toolResult?.content).toBe("Tool execution denied by user.");
  });

  it("passes a managed control surface to after-turn processors", async () => {
    let seenControl: AgentContextControl | undefined;
    const llm = createLLM([
      wrapResponse({
        id: "assist-1",
        type: MessageType.Assist,
        content: "done",
      }),
    ]);
    const agent = new MiniAgent(llm, createConfig(testDir));

    agent.register({
      priority: 0,
      process: async (control: AgentContextControl, input: Message): Promise<void> => {
        seenControl = control;
        expect(input.id).toBe("user-1");
        expect((await control.getMessages()).map((message) => message.id)).toEqual([
          "user-1",
          "assist-1",
        ]);
        await control.setDiscardBefore("user-1");
      },
    });

    const messages = await agent.run({
      id: "user-1",
      type: MessageType.User,
      content: "hello",
    });

    expect(seenControl).toBeDefined();
    expect(messages.map((message) => message.id)).toEqual(["assist-1"]);
  });
});

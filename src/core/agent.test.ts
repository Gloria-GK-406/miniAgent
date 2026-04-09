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
  LLMRequest,
  LLMMessageResponse,
  LLMResponse,
  LLMStreamHandle,
  Message,
  ToolCallMessage,
  ToolResultMessage,
  TurnContext,
} from "./types.js";
import type { AgentConfig } from "./config.js";
import type { Tool } from "../tool/types.js";
function createConfig(basepersistdir: string): AgentConfig {
  return {
    model: {
      provider: "test",
      model: "test-model",
      apiKey: "test-key",
      baseUrl: "http://localhost",
    },
    paths: { basepersistdir },
  };
}

function createResolvedHandle<T>(value: T): LLMStreamHandle<T> {
  return {
    onChunk: () => () => void 0,
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

describe("MiniAgent", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "miniagent-agent-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
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
      setTurnContext: async (context: TurnContext): Promise<void> => {
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

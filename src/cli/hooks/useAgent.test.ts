// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAgent } from "./useAgent.js";
import type { Message } from "../../core/index.js";
import { MessageType } from "../../core/index.js";

function createMockAgent() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    listeners,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    }),
    off: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(listener);
    }),
    removeAllListeners: vi.fn((event?: string) => {
      if (event) listeners.delete(event);
      else listeners.clear();
    }),
    run: vi.fn((_input: unknown) => Promise.resolve([])),
    getMessages: vi.fn(() => Promise.resolve([])),
    getContextCount: vi.fn(() => ({
      input: 0,
      output: 0,
      total: 0,
    })),
  };
}

type MockAgent = ReturnType<typeof createMockAgent>;

function emitEvent(agent: MockAgent, event: string, payload: unknown) {
  for (const listener of agent.listeners.get(event) ?? []) {
    listener(payload);
  }
}

describe("useAgent", () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = createMockAgent();
  });

  function setup() {
    return renderHook(() => useAgent(agent));
  }

  it("returns correct initial state", () => {
    const { result } = setup();
    expect(result.current.messages).toEqual([]);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.streamingText).toBe("");
    expect(result.current.reasoningText).toBe("");
    expect(result.current.currentTool).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.turnCount).toBe(0);
    expect(result.current.tokenUsage).toEqual({
      input: 0,
      output: 0,
      total: 0,
    });
  });

  it("updates streamingText on llm:chunk text-delta", () => {
    const { result } = setup();
    act(() => {
      emitEvent(agent, "llm:chunk", {
        chunk: { type: "text-delta", text: "Hello" },
      });
    });
    expect(result.current.streamingText).toBe("Hello");
  });

  it("updates reasoningText on llm:chunk reasoning-delta", () => {
    const { result } = setup();
    act(() => {
      emitEvent(agent, "llm:chunk", {
        chunk: { type: "reasoning-delta", text: "thinking..." },
      });
    });
    expect(result.current.reasoningText).toBe("thinking...");
  });

  it("sets currentTool on tool:execute", () => {
    const { result } = setup();
    act(() => {
      emitEvent(agent, "tool:execute", {
        toolCall: {
          id: "tc-1",
          type: MessageType.ToolCall,
          content: "",
          toolCallId: "call_1",
          toolName: "read_file",
          arguments: { path: "/tmp" },
        },
      });
    });
    expect(result.current.currentTool).toBe("read_file");
  });

  it("clears currentTool on tool:result", () => {
    const { result } = setup();
    act(() => {
      emitEvent(agent, "tool:execute", {
        toolCall: {
          id: "tc-1",
          type: MessageType.ToolCall,
          content: "",
          toolCallId: "call_1",
          toolName: "read_file",
          arguments: {},
        },
      });
    });
    expect(result.current.currentTool).toBe("read_file");

    act(() => {
      emitEvent(agent, "tool:result", {
        toolCall: {
          id: "tc-1",
          type: MessageType.ToolCall,
          content: "",
          toolCallId: "call_1",
          toolName: "read_file",
          arguments: {},
        },
        result: {
          id: "tr-1",
          type: MessageType.ToolResult,
          content: "file contents",
          toolCallId: "call_1",
        },
      });
    });
    expect(result.current.currentTool).toBeNull();
  });

  it("tracks isRunning on run:start and run:complete", () => {
    const { result } = setup();

    act(() => {
      emitEvent(agent, "run:start", {
        input: { id: "u-1", type: MessageType.User, content: "hi" },
      });
    });
    expect(result.current.isRunning).toBe(true);

    act(() => {
      emitEvent(agent, "run:complete", { messages: [] });
    });
    expect(result.current.isRunning).toBe(false);
  });

  it("sets error and clears isRunning on run:error", () => {
    const { result } = setup();

    act(() => {
      emitEvent(agent, "run:start", {
        input: { id: "u-1", type: MessageType.User, content: "hi" },
      });
    });
    expect(result.current.isRunning).toBe(true);

    act(() => {
      emitEvent(agent, "run:error", {
        error: new Error("something broke"),
        turn: 1,
      });
    });
    expect(result.current.error).toBe("something broke");
    expect(result.current.isRunning).toBe(false);
  });

  it("calls agent.run with UserMessage on sendMessage", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    expect(agent.run).toHaveBeenCalledTimes(1);
    const callArg = agent.run.mock.calls[0]?.[0] as Message | undefined;
    expect(callArg).toBeDefined();
    if (!callArg) return;
    expect(callArg.type).toBe(MessageType.User);
    expect(callArg.content).toBe("hello");
    expect(callArg.id).toBeDefined();
  });

  it("clears listeners on unmount", () => {
    const { unmount } = setup();

    expect(agent.listeners.size).toBeGreaterThan(0);

    unmount();

    for (const [, set] of agent.listeners) {
      expect(set.size).toBe(0);
    }
  });
});

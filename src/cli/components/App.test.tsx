import { describe, expect, it, vi } from "vitest";
import { renderToString } from "ink";
import { App, getMessageWindow, padMessageWindow } from "./App.js";
import { buildRenderableLines } from "./MessageList.js";
import { MessageType } from "../../core/types.js";
import type { CLIAppRuntime, CLIEvent, CLIRuntimeSubscriber, CLIState } from "../runtime/types.js";

function runtimeState(overrides: Partial<CLIState> = {}): CLIState {
  return {
    baseDir: process.cwd(),
    config: {} as CLIState["config"],
    mode: "build",
    modelName: "test/model",
    modelPaths: ["test/model"],
    sessionId: "s1",
    sessionName: "default",
    sessions: [],
    autoApprove: false,
    showReasoning: false,
    showToolDetails: false,
    isRunning: false,
    currentTool: null,
    messages: [],
    streamingText: "",
    reasoningText: "",
    turnCount: 0,
    tokenUsage: { input: 0, output: 0, total: 0 },
    panel: { type: "none" },
    approval: null,
    error: null,
    ...overrides,
  };
}

function createMockRuntime(overrides: Partial<CLIState> = {}): CLIAppRuntime {
  let current = runtimeState(overrides);
  const listeners = new Set<CLIRuntimeSubscriber>();
  const emit = (event: CLIEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };
  return {
    getState: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    submitInput: vi.fn(async () => undefined),
    runCommand: vi.fn(async (name) => {
      if (name === "panel-close") {
        current = { ...current, panel: { type: "none" } };
        emit({ type: "state", state: current });
      }
    }),
    selectModel: vi.fn(async (path) => {
      current = { ...current, modelName: path };
      emit({ type: "state", state: current });
    }),
    answerApproval: vi.fn(),
    stop: vi.fn(),
    rebuildAgent: vi.fn(async () => undefined),
    createSession: vi.fn(async () => undefined),
    switchSession: vi.fn(async () => undefined),
    renameSession: vi.fn(async () => undefined),
    deleteSession: vi.fn(async () => undefined),
    forkSession: vi.fn(async () => undefined),
    exportSession: vi.fn(async () => "session.md"),
    importSession: vi.fn(async () => undefined),
    undo: vi.fn(async () => undefined),
    redo: vi.fn(async () => undefined),
    compactContext: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
  };
}

describe("App", () => {
  it("anchors the message window to the bottom by default", () => {
    const messages = Array.from({ length: 6 }, (_, index) => ({
      id: String(index + 1),
      type: MessageType.Assist as const,
      content: `message-${index + 1}`,
    }));
    const lines = buildRenderableLines(messages, undefined, undefined, 80);
    const window = getMessageWindow(lines, 3, 0);
    expect(window.visibleLines.map((line) => line.text)).toEqual([
      "message-4",
      "message-5",
      "message-6",
    ]);
    expect(window.maxScrollFromBottom).toBe(3);
  });

  it("shows older messages when scrolled away from the bottom", () => {
    const messages = Array.from({ length: 6 }, (_, index) => ({
      id: String(index + 1),
      type: MessageType.Assist as const,
      content: `message-${index + 1}`,
    }));
    const lines = buildRenderableLines(messages, undefined, undefined, 80);
    const window = getMessageWindow(lines, 3, 2);
    expect(window.visibleLines.map((line) => line.text)).toEqual([
      "message-2",
      "message-3",
      "message-4",
    ]);
    expect(window.scrollFromBottom).toBe(2);
  });

  it("pads short windows so content stays bottom-aligned", () => {
    const padded = padMessageWindow(
      [
        { key: "line-1", text: "hello" },
        { key: "line-2", text: "world" },
      ],
      5,
    );
    expect(padded).toHaveLength(5);
    expect(padded.slice(0, 3).map((line) => line.text)).toEqual(["", "", ""]);
    expect(padded.slice(3).map((line) => line.text)).toEqual(["hello", "world"]);
  });

  it("renders model name from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({ modelName: "anthropic/claude-sonnet-4" })} />,
    );
    expect(output).toContain("anthropic/claude-sonnet-4");
  });

  it("renders session name from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({ sessionName: "my-session" })} />,
    );
    expect(output).toContain("my-session");
  });

  it("renders InputBox area", () => {
    const output = renderToString(
      <App runtime={createMockRuntime()} />,
    );
    expect(output).toContain("/help for commands");
  });

  it("renders history panel from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        panel: {
          type: "history",
          messages: [{ id: "1", type: MessageType.User, content: "hello" }],
        },
      })}
      />,
    );
    expect(output).toContain("History");
    expect(output).toContain("hello");
  });

  it("renders sessions panel from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        sessionId: "s2",
        sessionName: "work",
        sessions: [
          {
            id: "s1",
            name: "default",
            createdAt: "2026-07-02T00:00:00.000Z",
            updatedAt: "2026-07-02T00:00:00.000Z",
            messageCount: 1,
          },
          {
            id: "s2",
            name: "work",
            createdAt: "2026-07-02T00:00:01.000Z",
            updatedAt: "2026-07-02T00:00:01.000Z",
            messageCount: 2,
          },
        ],
        panel: {
          type: "sessions",
          sessions: [
            {
              id: "s1",
              name: "default",
              createdAt: "2026-07-02T00:00:00.000Z",
              updatedAt: "2026-07-02T00:00:00.000Z",
              messageCount: 1,
            },
            {
              id: "s2",
              name: "work",
              createdAt: "2026-07-02T00:00:01.000Z",
              updatedAt: "2026-07-02T00:00:01.000Z",
              messageCount: 2,
            },
          ],
        },
      })}
      />,
    );

    expect(output).toContain("Sessions");
    expect(output).toContain("* work");
    expect(output).toContain("default");
  });
});

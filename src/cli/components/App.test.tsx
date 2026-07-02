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
    activity: [],
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
    showGitStatus: vi.fn(async () => undefined),
    showGitLog: vi.fn(async () => undefined),
    showDiff: vi.fn(async () => undefined),
    openEditor: vi.fn(async () => ""),
    runDiagnostics: vi.fn(async () => undefined),
    showActivity: vi.fn(async () => undefined),
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

  it("renders focused approval prompt instead of normal input when approval is pending", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        approval: {
          id: "approval-1",
          toolName: "write",
          args: { path: "src/index.ts", content: "hello" },
          decision: "pending",
        },
      })}
      />,
    );

    expect(output).toContain("Approval required");
    expect(output).toContain("write");
    expect(output).toContain("src/index.ts");
    expect(output).toContain("[y]es");
    expect(output).not.toContain("/help for commands");
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

  it("renders git panel from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        panel: {
          type: "git",
          title: "Git Status",
          content: " M src/cli/components/App.tsx",
        },
      })}
      />,
    );

    expect(output).toContain("Git Status");
    expect(output).toContain("M src/cli/components/App.tsx");
  });

  it("renders diff panel from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        panel: {
          type: "diff",
          title: "Working Tree Diff",
          content: [
            "diff --git a/src/a.ts b/src/a.ts",
            "@@ -1 +1 @@",
            "-old",
            "+new",
          ].join("\n"),
        },
      })}
      />,
    );

    expect(output).toContain("Working Tree Diff");
    expect(output).toContain("-old");
    expect(output).toContain("+new");
  });

  it("renders diagnostics panel from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        panel: {
          type: "diagnostics",
          results: [
            {
              command: "npm run lint",
              stdout: "lint ok",
              stderr: "",
              exitCode: 0,
              timedOut: false,
              aborted: false,
            },
            {
              command: "npm test",
              stdout: "",
              stderr: "failed test",
              exitCode: 1,
              timedOut: false,
              aborted: false,
            },
          ],
        },
      })}
      />,
    );

    expect(output).toContain("Diagnostics");
    expect(output).toContain("PASS npm run lint");
    expect(output).toContain("FAIL npm test");
    expect(output).toContain("lint ok");
    expect(output).toContain("failed test");
  });

  it("renders activity panel from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        activity: [
          {
            id: "call-1",
            kind: "subagent",
            name: "run_subagent",
            status: "done",
            startedAt: "2026-07-02T00:00:00.000Z",
            endedAt: "2026-07-02T00:00:01.000Z",
            summary: "subtask complete",
          },
        ],
        panel: {
          type: "activity",
          entries: [
            {
              id: "call-1",
              kind: "subagent",
              name: "run_subagent",
              status: "done",
              startedAt: "2026-07-02T00:00:00.000Z",
              endedAt: "2026-07-02T00:00:01.000Z",
              summary: "subtask complete",
            },
          ],
        },
      })}
      />,
    );

    expect(output).toContain("Activity (1)");
    expect(output).toContain("DONE AGENT run_subagent");
    expect(output).toContain("subtask complete");
  });

  it("renders permissions panel from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        autoApprove: true,
        panel: {
          type: "permissions",
          permission: {
            "*": "ask",
            read: "allow",
            shell: {
              "*": "ask",
              "rm *": "deny",
            },
          },
          autoApprove: true,
        },
      })}
      />,
    );

    expect(output).toContain("Permissions");
    expect(output).toContain("Auto approval: on");
    expect(output).toContain("ALLOW read");
    expect(output).toContain("DENY shell:rm *");
  });
});

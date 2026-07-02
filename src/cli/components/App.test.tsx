import { describe, expect, it, vi } from "vitest";
import { renderToString } from "ink";
import { z } from "zod";
import {
  App,
  EXIT_CONFIRM_TEXT,
  STATIC_PANEL_CLOSE_TEXT,
  getMessageWindow,
  padMessageWindow,
  resolveCtrlCAction,
  resolveMessageScrollAction,
} from "./App.js";
import { buildRenderableLines } from "./MessageList.js";
import { MessageType, type Message } from "../../core/types.js";
import { CLIConfigSchema } from "../config.js";
import type { CLIAppRuntime, CLIEvent, CLIRuntimeSubscriber, CLIState } from "../runtime/types.js";

function runtimeState(overrides: Partial<CLIState> = {}): CLIState {
  return {
    baseDir: process.cwd(),
    config: {} as CLIState["config"],
    mode: "build",
    modelName: "test/model",
    modelPaths: ["test/model"],
    commandSuggestions: [],
    referencePaths: [],
    inputHistory: [],
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
    rememberInputHistory: vi.fn(async () => undefined),
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
    runDoctor: vi.fn(async () => undefined),
    listTools: vi.fn(async () => []),
    showActivity: vi.fn(async () => undefined),
    showAgents: vi.fn(async () => undefined),
    initializeProjectInstructions: vi.fn(async () => ({ written: true, path: "AGENTS.md" })),
    setPermissionRule: vi.fn(async () => undefined),
    unsetPermissionRule: vi.fn(async () => undefined),
    setSystemPrompt: vi.fn(async () => undefined),
    unsetSystemPrompt: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
  };
}

describe("App", () => {
  it("resolves Ctrl+C behavior from run and exit confirmation state", () => {
    expect(resolveCtrlCAction(true, false)).toBe("stop");
    expect(resolveCtrlCAction(false, false)).toBe("arm-exit");
    expect(resolveCtrlCAction(false, true)).toBe("exit");
  });

  it("routes message scrolling to paging keys so arrows remain available for input", () => {
    expect(resolveMessageScrollAction("", { upArrow: true })).toBe("none");
    expect(resolveMessageScrollAction("", { downArrow: true })).toBe("none");
    expect(resolveMessageScrollAction("", { pageUp: true })).toBe("page-up");
    expect(resolveMessageScrollAction("", { pageDown: true })).toBe("page-down");
    expect(resolveMessageScrollAction("u", { ctrl: true })).toBe("page-up");
    expect(resolveMessageScrollAction("d", { ctrl: true })).toBe("page-down");
    expect(resolveMessageScrollAction("", { home: true })).toBe("home");
    expect(resolveMessageScrollAction("", { end: true })).toBe("end");
  });

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

  it("renders token usage from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        tokenUsage: { input: 1536, output: 2500, total: 4036 },
      })}
      />,
    );

    expect(output).toContain("1.5k in / 2.5k out / 4.0k total");
  });

  it("renders InputBox area", () => {
    const output = renderToString(
      <App runtime={createMockRuntime()} />,
    );
    expect(output).toContain("/help for commands");
  });

  it("uses runtime visibility toggles for reasoning and tool details", () => {
    const messages: Message[] = [
      {
        id: "1",
        type: MessageType.Assist,
        content: "Answer",
        reasoningContent: "private reasoning",
      },
      {
        id: "2",
        type: MessageType.ToolCall,
        content: "",
        toolCallId: "tc1",
        toolName: "read",
        arguments: { path: "secret.txt" },
      },
      {
        id: "3",
        type: MessageType.ToolResult,
        content: "first line\nsecond line",
        toolCallId: "tc1",
      },
    ];

    const compact = renderToString(
      <App runtime={createMockRuntime({ messages })} />,
    );
    const detailed = renderToString(
      <App runtime={createMockRuntime({
        messages,
        showReasoning: true,
        showToolDetails: true,
      })}
      />,
    );

    expect(compact).not.toContain("private reasoning");
    expect(compact).not.toContain("secret.txt");
    expect(compact).not.toContain("second line");
    expect(detailed).toContain("private reasoning");
    expect(detailed).toContain("secret.txt");
    expect(detailed).toContain("second line");
  });

  it("renders registered command names in the help panel", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        commandSuggestions: ["/help", "/shortcut"],
        panel: { type: "help" },
      })}
      />,
    );

    expect(output).toContain("/shortcut");
  });

  it("exports Ctrl+C confirmation text for the idle exit prompt", () => {
    expect(EXIT_CONFIRM_TEXT).toBe("Press Ctrl+C again to exit");
  });

  it("renders static panel close affordance", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({ panel: { type: "tools", tools: [] } })} />,
    );

    expect(output).toContain(STATIC_PANEL_CLOSE_TEXT);
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

  it("renders filtered sessions panel from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        panel: {
          type: "sessions",
          query: "cli",
          sessions: [],
        },
      })}
      />,
    );

    expect(output).toContain('Sessions matching "cli"');
    expect(output).toContain("No sessions found");
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

  it("renders doctor panel from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        panel: {
          type: "doctor",
          checks: [
            {
              id: "configuration",
              label: "Configuration",
              status: "pass",
              detail: "1 provider, 1 model",
            },
            {
              id: "git",
              label: "Git",
              status: "warn",
              detail: "Workspace is not a Git repository",
            },
            {
              id: "model",
              label: "Default model",
              status: "fail",
              detail: "No model is selected",
            },
          ],
        },
      })}
      />,
    );

    expect(output).toContain("Doctor");
    expect(output).toContain("PASS Configuration");
    expect(output).toContain("WARN Git");
    expect(output).toContain("FAIL Default model");
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

  it("renders agents panel from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        panel: {
          type: "agents",
          mode: "build",
          subagents: [
            {
              id: "reviewer",
              name: "Reviewer",
              description: "Reviews code changes",
              model: "openai/fast",
              filePath: "C:/repo/.cliagent/subagent/reviewer.md",
            },
          ],
        } as never,
      })}
      />,
    );

    expect(output).toContain("Agents");
    expect(output).toContain("* build");
    expect(output).toContain("plan");
    expect(output).toContain("reviewer");
    expect(output).toContain("Reviews code changes");
    expect(output).toContain("openai/fast");
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

  it("renders tool permission state in the tools panel", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        config: CLIConfigSchema.parse({
          permission: {
            "*": "ask",
            read: "allow",
            shell: {
              "*": "ask",
              "rm *": "deny",
            },
          },
        }),
        panel: {
          type: "tools",
          tools: [
            {
              name: "read",
              description: "Read files",
              parameters: z.object({}),
              execute: vi.fn(async () => ""),
            },
            {
              name: "write",
              description: "Write files",
              parameters: z.object({}),
              execute: vi.fn(async () => ""),
            },
            {
              name: "shell",
              description: "Run shell commands",
              parameters: z.object({}),
              execute: vi.fn(async () => ""),
            },
          ],
        },
      })}
      />,
    );

    expect(output).toContain("ALLOW read");
    expect(output).toContain("ASK write");
    expect(output).toContain("ASK shell");
  });

  it("renders system prompt panel from runtime state", () => {
    const output = renderToString(
      <App runtime={createMockRuntime({
        panel: {
          type: "system",
          basePrompt: "Base prompt.",
          effectivePrompt: [
            "Base prompt.",
            "",
            "Working directory: C:/repo",
            "Agent mode: plan",
          ].join("\n"),
        },
      })}
      />,
    );

    expect(output).toContain("System Prompt");
    expect(output).toContain("Base prompt.");
    expect(output).toContain("Working directory: C:/repo");
    expect(output).toContain("Agent mode: plan");
  });
});

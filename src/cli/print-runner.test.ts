import { describe, expect, it, vi } from "vitest";
import { MessageType } from "../core/types.js";
import type { CLIAppRuntime, CLIState } from "./runtime/types.js";
import {
  latestAssistantText,
  runPrintPrompt,
} from "./print-runner.js";

function state(overrides: Partial<CLIState> = {}): CLIState {
  return {
    baseDir: process.cwd(),
    config: {} as CLIState["config"],
    mode: "build",
    modelName: "test/model",
    modelPaths: [],
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

function runtime(current: CLIState): CLIAppRuntime {
  return {
    getState: () => current,
    subscribe: vi.fn(() => () => undefined),
    submitInput: vi.fn(async () => undefined),
    runCommand: vi.fn(async () => undefined),
    selectModel: vi.fn(async () => undefined),
    rememberInputHistory: vi.fn(async () => undefined),
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
    showActivity: vi.fn(async () => undefined),
    showAgents: vi.fn(async () => undefined),
    initializeProjectInstructions: vi.fn(async () => ({ written: false, path: "AGENTS.md" })),
    setPermissionRule: vi.fn(async () => undefined),
    unsetPermissionRule: vi.fn(async () => undefined),
    setSystemPrompt: vi.fn(async () => undefined),
    unsetSystemPrompt: vi.fn(async () => undefined),
    answerApproval: vi.fn(),
    stop: vi.fn(),
    rebuildAgent: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
  };
}

describe("latestAssistantText", () => {
  it("returns the last assistant message content", () => {
    expect(latestAssistantText([
      { id: "a1", type: MessageType.Assist, content: "old" },
      { id: "u1", type: MessageType.User, content: "question" },
      { id: "a2", type: MessageType.Assist, content: "final" },
    ])).toBe("final");
  });

  it("formats structured text assistant content", () => {
    expect(latestAssistantText([
      {
        id: "a1",
        type: MessageType.Assist,
        content: { type: "text", text: "structured" },
      },
    ])).toBe("structured");
  });
});

describe("runPrintPrompt", () => {
  it("submits the prompt, prints the final assistant response, and destroys the runtime", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const app = runtime(state({
      messages: [{ id: "a1", type: MessageType.Assist, content: "done" }],
    }));

    await expect(runPrintPrompt(app, "do work", { stdout, stderr })).resolves.toBe(0);

    expect(app.submitInput).toHaveBeenCalledWith("do work");
    expect(stdout).toHaveBeenCalledWith("done\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(app.destroy).toHaveBeenCalled();
  });

  it("prints runtime errors to stderr and returns non-zero", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const app = runtime(state({
      panel: { type: "error", message: "bad config" },
    }));

    await expect(runPrintPrompt(app, "do work", { stdout, stderr })).resolves.toBe(1);

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith("bad config\n");
    expect(app.destroy).toHaveBeenCalled();
  });
});

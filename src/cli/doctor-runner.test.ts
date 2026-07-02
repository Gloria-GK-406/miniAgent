import { describe, expect, it, vi } from "vitest";
import type { CLIAppRuntime, CLIState } from "./runtime/types.js";
import {
  formatDoctorChecks,
  formatDoctorChecksJson,
  runDoctorChecks,
} from "./doctor-runner.js";

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
    setAgentMode: vi.fn(async () => undefined),
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

describe("formatDoctorChecks", () => {
  it("formats doctor checks as plain text", () => {
    expect(formatDoctorChecks([
      { id: "configuration", label: "Configuration", status: "pass", detail: "ok" },
      { id: "git", label: "Git", status: "warn", detail: "not a repo" },
    ])).toBe("PASS Configuration - ok\nWARN Git - not a repo\n");
  });
});

describe("formatDoctorChecksJson", () => {
  it("formats doctor checks as json with an ok flag", () => {
    expect(formatDoctorChecksJson([
      { id: "configuration", label: "Configuration", status: "pass", detail: "ok" },
      { id: "model", label: "Default model", status: "fail", detail: "missing" },
    ])).toBe([
      "{",
      "  \"ok\": false,",
      "  \"checks\": [",
      "    {",
      "      \"id\": \"configuration\",",
      "      \"label\": \"Configuration\",",
      "      \"status\": \"pass\",",
      "      \"detail\": \"ok\"",
      "    },",
      "    {",
      "      \"id\": \"model\",",
      "      \"label\": \"Default model\",",
      "      \"status\": \"fail\",",
      "      \"detail\": \"missing\"",
      "    }",
      "  ]",
      "}\n",
    ].join("\n"));
  });
});

describe("runDoctorChecks", () => {
  it("runs doctor, prints checks, and returns zero when there are no failures", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const app = runtime(state({
      panel: {
        type: "doctor",
        checks: [
          { id: "configuration", label: "Configuration", status: "pass", detail: "ok" },
          { id: "git", label: "Git", status: "warn", detail: "not a repo" },
        ],
      },
    }));

    await expect(runDoctorChecks(app, { stdout, stderr })).resolves.toBe(0);

    expect(app.runDoctor).toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith("PASS Configuration - ok\nWARN Git - not a repo\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(app.destroy).toHaveBeenCalled();
  });

  it("prints json when requested", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const app = runtime(state({
      panel: {
        type: "doctor",
        checks: [
          { id: "configuration", label: "Configuration", status: "pass", detail: "ok" },
        ],
      },
    }));

    await expect(runDoctorChecks(app, { stdout, stderr }, { output: "json" })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatDoctorChecksJson([
      { id: "configuration", label: "Configuration", status: "pass", detail: "ok" },
    ]));
  });

  it("returns non-zero when any doctor check fails", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const app = runtime(state({
      panel: {
        type: "doctor",
        checks: [
          { id: "model", label: "Default model", status: "fail", detail: "missing" },
        ],
      },
    }));

    await expect(runDoctorChecks(app, { stdout, stderr })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("FAIL Default model - missing\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(app.destroy).toHaveBeenCalled();
  });
});

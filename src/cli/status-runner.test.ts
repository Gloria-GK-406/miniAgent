import { describe, expect, it, vi } from "vitest";
import { MessageType } from "../core/index.js";
import { CLIConfigSchema } from "./config.js";
import type { CLIAppRuntime, CLIState } from "./runtime/types.js";
import {
  formatRuntimeStatus,
  formatRuntimeStatusJson,
  runRuntimeStatus,
  toRuntimeStatus,
} from "./status-runner.js";

function state(overrides: Partial<CLIState> = {}): CLIState {
  return {
    baseDir: "C:/repo/project",
    config: CLIConfigSchema.parse({
      permission: {
        "*": "ask",
        read: "allow",
      },
    }),
    mode: "plan",
    modelName: "openai/fast",
    modelPaths: ["openai/fast"],
    commandSuggestions: [],
    commandHelp: [],
    referencePaths: [],
    inputHistory: [],
    sessionId: "session-1",
    sessionName: "feature work",
    sessions: [],
    autoApprove: true,
    showReasoning: true,
    showToolDetails: false,
    isRunning: false,
    currentTool: null,
    messages: [
      { id: "u1", type: MessageType.User, content: "hello" },
      { id: "a1", type: MessageType.Assist, content: "hi" },
    ],
    streamingText: "",
    reasoningText: "",
    turnCount: 3,
    tokenUsage: { input: 1234, output: 5678, total: 6912 },
    activity: [],
    panel: { type: "none" },
    approval: null,
    error: null,
    exitRequested: false,
    ...overrides,
  };
}

describe("toRuntimeStatus", () => {
  it("converts runtime state to serializable status", () => {
    expect(toRuntimeStatus(state())).toEqual({
      ok: true,
      baseDir: "C:/repo/project",
      sessionId: "session-1",
      sessionName: "feature work",
      mode: "plan",
      modelName: "openai/fast",
      messageCount: 2,
      tokenUsage: { input: 1234, output: 5678, total: 6912 },
      autoApprove: true,
      showReasoning: true,
      showToolDetails: false,
      defaultPermission: "ask",
      isRunning: false,
      currentTool: null,
    });
  });
});

describe("formatRuntimeStatus", () => {
  it("formats status as terminal text", () => {
    expect(formatRuntimeStatus(toRuntimeStatus(state()))).toBe([
      "Workspace: C:/repo/project",
      "Session: feature work (session-1)",
      "Agent: plan",
      "Model: openai/fast",
      "Transcript: 2 messages",
      "Tokens: 1.2k in / 5.7k out / 6.9k total",
      "Auto approval: on",
      "Reasoning: on",
      "Tool details: off",
      "Default permission: ask",
      "Running: no",
      "",
    ].join("\n"));
  });
});

describe("formatRuntimeStatusJson", () => {
  it("formats status as json", () => {
    expect(formatRuntimeStatusJson(toRuntimeStatus(state()))).toContain('"ok": true');
    expect(formatRuntimeStatusJson(toRuntimeStatus(state()))).toContain('"messageCount": 2');
  });
});

describe("runRuntimeStatus", () => {
  it("prints runtime status and destroys the runtime", async () => {
    const runtime = {
      getState: vi.fn(() => state()),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runRuntimeStatus(runtime, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatRuntimeStatus(toRuntimeStatus(state())));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints runtime status as json", async () => {
    const runtime = {
      getState: vi.fn(() => state()),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runRuntimeStatus(runtime, { stdout, stderr }, { output: "json" })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatRuntimeStatusJson(toRuntimeStatus(state())));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints status errors as json when requested", async () => {
    const runtime = {
      getState: vi.fn(() => {
        throw new Error("state unavailable");
      }),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runRuntimeStatus(runtime, { stdout, stderr }, { output: "json" })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"state unavailable\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });
});

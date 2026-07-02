import { describe, expect, it, vi } from "vitest";
import type { CLIAppRuntime, CLIOverviewInfo, CLIState } from "./runtime/types.js";
import {
  formatOverview,
  formatOverviewJson,
  runOverview,
} from "./overview-runner.js";

const info: CLIOverviewInfo = {
  workspace: "C:/repo/project",
  sessionId: "session-1",
  sessionName: "feature work",
  sessionCount: 2,
  mode: "build",
  modelName: "openai/fast",
  messageCount: 4,
  tokenUsage: { input: 1234, output: 5678, total: 6912 },
  autoApprove: true,
  showReasoning: true,
  showToolDetails: false,
  defaultPermission: "ask",
  todoCounts: { pending: 2, inProgress: 1, completed: 4, total: 7 },
  activityCounts: { running: 1, done: 5, error: 2, total: 8 },
  git: {
    repository: true,
    branch: "main",
    changedFiles: 3,
    stagedFiles: 1,
    untrackedFiles: 2,
    summary: "3 changed, 1 staged, 2 untracked",
  },
};

describe("formatOverview", () => {
  it("formats overview info as terminal text", () => {
    expect(formatOverview(info)).toBe([
      "Overview",
      "Workspace: C:/repo/project",
      "Session: feature work (session-1) - 2 sessions",
      "Agent: build",
      "Model: openai/fast",
      "Transcript: 4 messages",
      "Tokens: 1.2k in / 5.7k out / 6.9k total",
      "Todos: 2 pending / 1 active / 4 done",
      "Activity: 1 running / 5 done / 2 errors",
      "Git: main - 3 changed, 1 staged, 2 untracked",
      "Permissions: ask default, auto on",
      "Reasoning: on",
      "Tool details: off",
      "",
    ].join("\n"));
  });

  it("formats non-git workspaces", () => {
    expect(formatOverview({
      ...info,
      git: {
        repository: false,
        changedFiles: 0,
        stagedFiles: 0,
        untrackedFiles: 0,
        summary: "not a git repository",
      },
    })).toContain("Git: not a git repository");
  });
});

describe("formatOverviewJson", () => {
  it("formats overview info as json", () => {
    expect(formatOverviewJson(info)).toContain("\"ok\": true");
    expect(formatOverviewJson(info)).toContain("\"info\"");
    expect(formatOverviewJson(info)).toContain("\"workspace\": \"C:/repo/project\"");
  });
});

describe("runOverview", () => {
  it("opens overview state, prints text, and destroys the runtime", async () => {
    let panel: CLIState["panel"] = { type: "none" };
    const runtime = {
      showOverview: vi.fn(async () => {
        panel = { type: "overview", info };
      }),
      getState: () => ({ panel }) as CLIState,
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runOverview(runtime, { stdout, stderr })).resolves.toBe(0);

    expect(runtime.showOverview).toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith(formatOverview(info));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints overview state as json", async () => {
    let panel: CLIState["panel"] = { type: "none" };
    const runtime = {
      showOverview: vi.fn(async () => {
        panel = { type: "overview", info };
      }),
      getState: () => ({ panel }) as CLIState,
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runOverview(runtime, { stdout, stderr }, { output: "json" })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatOverviewJson(info));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints runtime errors as json when requested", async () => {
    const runtime = {
      showOverview: vi.fn(async () => {
        throw new Error("overview unavailable");
      }),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runOverview(runtime, { stdout, stderr }, { output: "json" })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"overview unavailable\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });
});

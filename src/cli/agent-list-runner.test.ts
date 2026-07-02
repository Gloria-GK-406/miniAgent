import { describe, expect, it, vi } from "vitest";
import type { CLIAppRuntime, CLIState } from "./runtime/types.js";
import {
  formatAgentList,
  formatAgentListJson,
  runAgentList,
} from "./agent-list-runner.js";

const panel = {
  type: "agents" as const,
  mode: "build" as const,
  subagents: [
    {
      id: "reviewer",
      name: "Reviewer",
      description: "Reviews code changes",
      model: "openai/fast",
      filePath: "C:/repo/.cliagent/subagent/reviewer.md",
    },
  ],
};

describe("formatAgentList", () => {
  it("formats the primary agent mode and subagents as text", () => {
    expect(formatAgentList(panel)).toBe([
      "Primary agent: build",
      "Subagents:",
      "- reviewer (Reviewer) - Reviews code changes [openai/fast]",
      "",
    ].join("\n"));
  });

  it("formats empty subagent lists", () => {
    expect(formatAgentList({ type: "agents", mode: "plan", subagents: [] })).toBe([
      "Primary agent: plan",
      "Subagents: none",
      "",
    ].join("\n"));
  });
});

describe("formatAgentListJson", () => {
  it("formats agents as json", () => {
    expect(formatAgentListJson(panel)).toContain("\"subagents\"");
  });
});

describe("runAgentList", () => {
  it("prints the runtime agent list and destroys the runtime", async () => {
    let currentPanel: CLIState["panel"] = { type: "none" };
    const runtime = {
      showAgents: vi.fn(async () => {
        currentPanel = panel;
      }),
      getState: () => ({ panel: currentPanel }) as CLIState,
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runAgentList(runtime, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatAgentList(panel));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints the runtime agent list as json", async () => {
    let currentPanel: CLIState["panel"] = { type: "none" };
    const runtime = {
      showAgents: vi.fn(async () => {
        currentPanel = panel;
      }),
      getState: () => ({ panel: currentPanel }) as CLIState,
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runAgentList(runtime, {
      stdout,
      stderr,
    }, {
      output: "json",
    })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatAgentListJson(panel));
    expect(stderr).not.toHaveBeenCalled();
  });
});

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { CLICommandContext, CLIState } from "./types.js";
import { loadCustomCommands } from "./custom-command-service.js";

function state(): CLIState {
  return {
    baseDir: process.cwd(),
    config: {} as CLIState["config"],
    mode: "build",
    modelName: "openai/fast",
    modelPaths: ["openai/fast"],
    referencePaths: [],
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
  };
}

async function writeCommand(baseDir: string, name: string, content: string): Promise<void> {
  await mkdir(join(baseDir, ".cliagent", "commands"), { recursive: true });
  await writeFile(join(baseDir, ".cliagent", "commands", `${name}.md`), content, "utf-8");
}

describe("loadCustomCommands", () => {
  it("loads frontmatter and renders arguments", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-custom-command-"));
    await writeCommand(baseDir, "test", [
      "---",
      "description: Run tests",
      "agent: build",
      "---",
      "",
      "Run tests with these arguments: {{args}}",
    ].join("\n"));
    const commands = await loadCustomCommands(baseDir);
    const submitInput = vi.fn(async () => undefined);
    const ctx = {
      runtime: {
        submitInput,
      },
      agent: {},
      getState: state,
      updateState: vi.fn(),
      notice: vi.fn(),
    } as unknown as CLICommandContext;

    expect(commands).toHaveLength(1);
    expect(commands[0]!.name).toBe("test");
    expect(commands[0]!.description).toBe("Run tests");

    await commands[0]!.execute(ctx, "src/cli");

    expect(submitInput).toHaveBeenCalledWith("Run tests with these arguments: src/cli");
  });

  it("supports $ARGUMENTS placeholders", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-custom-command-args-"));
    await writeCommand(baseDir, "review", "Review this: $ARGUMENTS");
    const [command] = await loadCustomCommands(baseDir);
    const submitInput = vi.fn(async () => undefined);
    const ctx = {
      runtime: { submitInput },
      agent: {},
      getState: state,
      updateState: vi.fn(),
      notice: vi.fn(),
    } as unknown as CLICommandContext;

    await command!.execute(ctx, "src/core");

    expect(submitInput).toHaveBeenCalledWith("Review this: src/core");
  });
});

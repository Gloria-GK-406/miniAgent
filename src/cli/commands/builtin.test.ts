import { describe, expect, it, vi } from "vitest";
import { createCommandRegistry } from "../runtime/command-registry.js";
import type { CLICommandContext, CLIState } from "../runtime/types.js";
import { registerBuiltinCommands } from "./builtin.js";

function state(): CLIState {
  return {
    baseDir: process.cwd(),
    config: {} as CLIState["config"],
    mode: "build",
    modelName: "openai/fast",
    modelPaths: ["openai/fast"],
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
  };
}

function ctx(): CLICommandContext {
  let current = state();
  return {
    runtime: {
      rebuildAgent: vi.fn(async () => undefined),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLICommandContext["runtime"],
    agent: {
      getMessages: vi.fn(async () => []),
      previewContext: vi.fn(async () => []),
      getToolList: vi.fn(async () => []),
    } as unknown as CLICommandContext["agent"],
    getState: () => current,
    updateState: (patch) => {
      current = { ...current, ...patch };
    },
    notice: vi.fn(),
  };
}

describe("registerBuiltinCommands", () => {
  it("registers Phase 1 commands", () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);

    expect(registry.list().map((command) => command.name)).toEqual(expect.arrayContaining([
      "help",
      "compact",
      "context",
      "history",
      "tools",
      "models",
      "new",
      "sessions",
      "agent",
      "auto",
      "details",
      "thinking",
      "panel-close",
      "quit",
    ]));
  });

  it("opens help panel", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/help");

    expect(commandCtx.getState().panel).toEqual({ type: "help" });
  });

  it("switches agent mode and rebuilds the runtime agent", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/agent plan");

    expect(commandCtx.getState().mode).toBe("plan");
    expect(commandCtx.runtime.rebuildAgent).toHaveBeenCalledWith("switch agent plan");
  });

  it("dispatches session subcommands to runtime methods", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.createSession = vi.fn(async () => undefined);
    commandCtx.runtime.switchSession = vi.fn(async () => undefined);
    commandCtx.runtime.renameSession = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/new feature work");
    await registry.execute(commandCtx, "/sessions switch s2");
    await registry.execute(commandCtx, "/sessions rename s2 renamed session");

    expect(commandCtx.runtime.createSession).toHaveBeenCalledWith("feature work");
    expect(commandCtx.runtime.switchSession).toHaveBeenCalledWith("s2");
    expect(commandCtx.runtime.renameSession).toHaveBeenCalledWith("s2", "renamed session");
  });

  it("dispatches export and import commands to runtime methods", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.exportSession = vi.fn(async () => "out.json");
    commandCtx.runtime.importSession = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/export json exports/session.json");
    await registry.execute(commandCtx, "/import exports/session.json imported session");

    expect(commandCtx.runtime.exportSession).toHaveBeenCalledWith("json", "exports/session.json");
    expect(commandCtx.runtime.importSession).toHaveBeenCalledWith("exports/session.json", "imported session");
  });

  it("dispatches undo and redo commands to runtime methods", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.undo = vi.fn(async () => undefined);
    commandCtx.runtime.redo = vi.fn(async () => undefined);
    commandCtx.runtime.compactContext = vi.fn(async () => undefined);
    commandCtx.runtime.showGitStatus = vi.fn(async () => undefined);
    commandCtx.runtime.showGitLog = vi.fn(async () => undefined);
    commandCtx.runtime.showDiff = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/undo");
    await registry.execute(commandCtx, "/redo");
    await registry.execute(commandCtx, "/compact");
    await registry.execute(commandCtx, "/git status");
    await registry.execute(commandCtx, "/git log 3");
    await registry.execute(commandCtx, "/diff src/cli");

    expect(commandCtx.runtime.undo).toHaveBeenCalled();
    expect(commandCtx.runtime.redo).toHaveBeenCalled();
    expect(commandCtx.runtime.compactContext).toHaveBeenCalled();
    expect(commandCtx.runtime.showGitStatus).toHaveBeenCalled();
    expect(commandCtx.runtime.showGitLog).toHaveBeenCalledWith(3);
    expect(commandCtx.runtime.showDiff).toHaveBeenCalledWith("src/cli");
  });

  it("submits edited content from the external editor command", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.openEditor = vi.fn(async () => "edited prompt");
    commandCtx.runtime.submitInput = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/editor initial prompt");

    expect(commandCtx.runtime.openEditor).toHaveBeenCalledWith("initial prompt");
    expect(commandCtx.runtime.submitInput).toHaveBeenCalledWith("edited prompt");
  });

  it("does not submit empty edited content", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.openEditor = vi.fn(async () => " \n");
    commandCtx.runtime.submitInput = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/editor");

    expect(commandCtx.runtime.submitInput).not.toHaveBeenCalled();
    expect(commandCtx.notice).toHaveBeenCalledWith("info", "Editor returned empty content");
  });

  it("opens sessions panel with session metadata", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    const sessions = [{
      id: "s1",
      name: "default",
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
      messageCount: 0,
    }];
    commandCtx.updateState({ sessions });

    await registry.execute(commandCtx, "/sessions");

    expect(commandCtx.getState().panel).toEqual({ type: "sessions", sessions });
  });
});

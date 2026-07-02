import { describe, expect, it, vi } from "vitest";
import { CLIConfigSchema } from "../config.js";
import { createCommandRegistry } from "../runtime/command-registry.js";
import type { CLICommandContext, CLIState } from "../runtime/types.js";
import { registerBuiltinCommands } from "./builtin.js";

function state(): CLIState {
  return {
    baseDir: process.cwd(),
    config: CLIConfigSchema.parse({}),
    mode: "build",
    modelName: "openai/fast",
    modelPaths: ["openai/fast"],
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
      "doctor",
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

  it("selects a model when /model receives a selector", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.selectModel = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/model openai/fast");

    expect(commandCtx.runtime.selectModel).toHaveBeenCalledWith("openai/fast");
  });

  it("switches agent mode and rebuilds the runtime agent", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/agent plan");

    expect(commandCtx.getState().mode).toBe("plan");
    expect(commandCtx.runtime.rebuildAgent).toHaveBeenCalledWith("switch agent plan");
  });

  it("opens the agent list when /agent has no mode", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.showAgents = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/agent");

    expect(commandCtx.runtime.showAgents).toHaveBeenCalled();
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
    commandCtx.runtime.runDiagnostics = vi.fn(async () => undefined);
    commandCtx.runtime.runDoctor = vi.fn(async () => undefined);
    commandCtx.runtime.showActivity = vi.fn(async () => undefined);
    commandCtx.runtime.initializeProjectInstructions = vi.fn(async () => ({
      written: true,
      path: "AGENTS.md",
    }));
    commandCtx.runtime.setPermissionRule = vi.fn(async () => undefined);
    commandCtx.runtime.unsetPermissionRule = vi.fn(async () => undefined);
    commandCtx.runtime.setSystemPrompt = vi.fn(async () => undefined);
    commandCtx.runtime.unsetSystemPrompt = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/init");
    await registry.execute(commandCtx, "/init --force");
    await registry.execute(commandCtx, "/permissions");
    expect(commandCtx.getState().panel).toEqual({
      type: "permissions",
      permission: commandCtx.getState().config.permission,
      autoApprove: false,
    });
    await registry.execute(commandCtx, "/permissions set shell:npm * allow");
    await registry.execute(commandCtx, "/permissions unset write");

    await registry.execute(commandCtx, "/system");
    await registry.execute(commandCtx, "/system set Custom coding prompt");
    await registry.execute(commandCtx, "/system unset");
    await registry.execute(commandCtx, "/undo");
    await registry.execute(commandCtx, "/redo");
    await registry.execute(commandCtx, "/compact");
    await registry.execute(commandCtx, "/git status");
    await registry.execute(commandCtx, "/git log 3");
    await registry.execute(commandCtx, "/diff src/cli");
    await registry.execute(commandCtx, "/diagnostics");
    await registry.execute(commandCtx, "/doctor");
    await registry.execute(commandCtx, "/activity");

    expect(commandCtx.runtime.undo).toHaveBeenCalled();
    expect(commandCtx.runtime.redo).toHaveBeenCalled();
    expect(commandCtx.runtime.compactContext).toHaveBeenCalled();
    expect(commandCtx.runtime.showGitStatus).toHaveBeenCalled();
    expect(commandCtx.runtime.showGitLog).toHaveBeenCalledWith(3);
    expect(commandCtx.runtime.showDiff).toHaveBeenCalledWith("src/cli");
    expect(commandCtx.runtime.runDiagnostics).toHaveBeenCalled();
    expect(commandCtx.runtime.runDoctor).toHaveBeenCalled();
    expect(commandCtx.runtime.showActivity).toHaveBeenCalled();
    expect(commandCtx.runtime.initializeProjectInstructions).toHaveBeenNthCalledWith(1, false);
    expect(commandCtx.runtime.initializeProjectInstructions).toHaveBeenNthCalledWith(2, true);
    expect(commandCtx.runtime.setPermissionRule).toHaveBeenCalledWith("shell:npm *", "allow");
    expect(commandCtx.runtime.unsetPermissionRule).toHaveBeenCalledWith("write");
    expect(commandCtx.runtime.setSystemPrompt).toHaveBeenCalledWith("Custom coding prompt");
    expect(commandCtx.runtime.unsetSystemPrompt).toHaveBeenCalled();
    expect(commandCtx.getState().panel).toEqual({
      type: "system",
      basePrompt: "You are a helpful assistant.",
      effectivePrompt: expect.stringContaining("Agent mode: build"),
    });
  });

  it("shows an error panel for malformed permissions commands", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.setPermissionRule = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/permissions set write maybe");

    expect(commandCtx.runtime.setPermissionRule).not.toHaveBeenCalled();
    expect(commandCtx.getState().panel).toEqual({
      type: "error",
      message: "Usage: /permissions set <target> <allow|ask|deny>",
    });
  });

  it("shows an error panel for malformed system commands", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.setSystemPrompt = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/system set");

    expect(commandCtx.runtime.setSystemPrompt).not.toHaveBeenCalled();
    expect(commandCtx.getState().panel).toEqual({
      type: "error",
      message: "Usage: /system set <prompt>",
    });
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

  it("filters sessions by name or id", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    const sessions = [
      {
        id: "alpha-session",
        name: "default",
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
        messageCount: 0,
      },
      {
        id: "beta-session",
        name: "Refactor CLI",
        createdAt: "2026-07-02T00:00:01.000Z",
        updatedAt: "2026-07-02T00:00:01.000Z",
        messageCount: 3,
      },
    ];
    commandCtx.updateState({ sessions });

    await registry.execute(commandCtx, "/sessions search cli");

    expect(commandCtx.getState().panel).toEqual({
      type: "sessions",
      query: "cli",
      sessions: [sessions[1]!],
    });
  });
});

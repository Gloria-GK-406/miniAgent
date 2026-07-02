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
      "context",
      "history",
      "tools",
      "models",
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
});

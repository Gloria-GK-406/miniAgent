import { describe, expect, it, vi } from "vitest";
import { createCommandRegistry } from "./command-registry.js";
import type { CLICommandContext } from "./types.js";

function ctx(): CLICommandContext {
  return {
    runtime: {} as CLICommandContext["runtime"],
    agent: {} as CLICommandContext["agent"],
    getState: vi.fn(),
    updateState: vi.fn(),
    notice: vi.fn(),
  };
}

describe("CommandRegistry", () => {
  it("registers and resolves commands by name and alias", async () => {
    const registry = createCommandRegistry();
    const execute = vi.fn(async () => undefined);

    registry.register({
      name: "quit",
      aliases: ["q"],
      description: "Exit",
      usage: "/quit",
      execute,
    });

    await registry.execute(ctx(), "/q");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("splits command args after the command token", async () => {
    const registry = createCommandRegistry();
    const execute = vi.fn(async () => undefined);
    registry.register({
      name: "system",
      description: "Set system prompt",
      usage: "/system <text>",
      execute,
    });

    await registry.execute(ctx(), "/system hello world");
    expect(execute).toHaveBeenCalledWith(expect.anything(), "hello world");
  });

  it("returns visible completions", async () => {
    const registry = createCommandRegistry();
    registry.register({
      name: "help",
      description: "Help",
      usage: "/help",
      execute: async () => undefined,
    });
    registry.register({
      name: "hidden",
      hidden: true,
      description: "Hidden",
      usage: "/hidden",
      execute: async () => undefined,
    });

    expect(await registry.complete(ctx(), "/h")).toEqual(["/help"]);
  });
});

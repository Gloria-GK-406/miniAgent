import { describe, expect, it, vi } from "vitest";
import type { CLIAppRuntime } from "./runtime/types.js";
import { applyCLIEntryRuntimeOptions } from "./entry-runtime-options.js";

describe("applyCLIEntryRuntimeOptions", () => {
  it("accepts doctor actions with startup options", async () => {
    const runtime = {
      runCommand: vi.fn(async () => undefined),
      selectModel: vi.fn(async () => undefined),
      switchSession: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, {
      type: "doctor",
      sessionId: "s2",
      model: "openai/fast",
    });

    expect(runtime.switchSession).toHaveBeenCalledWith("s2");
    expect(runtime.selectModel).toHaveBeenCalledWith("openai/fast");
  });

  it("accepts status actions with startup options", async () => {
    const runtime = {
      runCommand: vi.fn(async () => undefined),
      selectModel: vi.fn(async () => undefined),
      switchSession: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, {
      type: "status",
      sessionId: "s2",
      agent: "plan",
      model: "openai/fast",
    });

    expect(runtime.switchSession).toHaveBeenCalledWith("s2");
    expect(runtime.runCommand).toHaveBeenCalledWith("agent", "plan");
    expect(runtime.selectModel).toHaveBeenCalledWith("openai/fast");
  });

  it("accepts snapshot listing actions with a startup session", async () => {
    const runtime = {
      switchSession: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, {
      type: "list-snapshots",
      sessionId: "s2",
    });

    expect(runtime.switchSession).toHaveBeenCalledWith("s2");
  });

  it("accepts snapshot restore actions with a startup session", async () => {
    const runtime = {
      switchSession: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, {
      type: "snapshot-action",
      action: "restore",
      sessionId: "s2",
      turnId: "turn-1",
    });

    expect(runtime.switchSession).toHaveBeenCalledWith("s2");
  });

  it("selects the requested startup model when present", async () => {
    const runtime = {
      runCommand: vi.fn(async () => undefined),
      selectModel: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, { type: "tui", model: "openai/fast" });

    expect(runtime.selectModel).toHaveBeenCalledWith("openai/fast");
  });

  it("switches the requested startup agent before selecting a model", async () => {
    const runtime = {
      runCommand: vi.fn(async () => undefined),
      selectModel: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, {
      type: "print",
      agent: "plan",
      model: "openai/fast",
      prompt: "think",
    });

    expect(runtime.runCommand).toHaveBeenCalledWith("agent", "plan");
    expect(runtime.runCommand).toHaveBeenCalledBefore(runtime.selectModel);
  });

  it("switches the requested startup session before selecting a model", async () => {
    const runtime = {
      runCommand: vi.fn(async () => undefined),
      selectModel: vi.fn(async () => undefined),
      switchSession: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, {
      type: "tui",
      sessionId: "s2",
      model: "openai/fast",
    });

    expect(runtime.switchSession).toHaveBeenCalledWith("s2");
    expect(runtime.switchSession).toHaveBeenCalledBefore(runtime.selectModel);
  });

  it("creates the requested startup session before selecting a model", async () => {
    const runtime = {
      runCommand: vi.fn(async () => undefined),
      selectModel: vi.fn(async () => undefined),
      createSession: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, {
      type: "print",
      newSession: "scratch",
      model: "openai/fast",
      prompt: "think",
    });

    expect(runtime.createSession).toHaveBeenCalledWith("scratch");
    expect(runtime.createSession).toHaveBeenCalledBefore(runtime.selectModel);
  });

  it("enables startup auto approval before selecting a model", async () => {
    const runtime = {
      runCommand: vi.fn(async () => undefined),
      selectModel: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, {
      type: "print",
      autoApprove: true,
      model: "openai/fast",
      prompt: "think",
    });

    expect(runtime.runCommand).toHaveBeenCalledWith("auto", "");
    expect(runtime.runCommand).toHaveBeenCalledBefore(runtime.selectModel);
  });

  it("does not switch agents when no startup agent is present", async () => {
    const runtime = {
      runCommand: vi.fn(async () => undefined),
      selectModel: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, { type: "tui" });

    expect(runtime.runCommand).not.toHaveBeenCalled();
  });

  it("does not select a model when no startup model is present", async () => {
    const runtime = {
      runCommand: vi.fn(async () => undefined),
      selectModel: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, { type: "tui" });

    expect(runtime.selectModel).not.toHaveBeenCalled();
  });
});

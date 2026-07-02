import { describe, expect, it, vi } from "vitest";
import type { CLIAppRuntime } from "./runtime/types.js";
import { applyCLIEntryRuntimeOptions } from "./entry-runtime-options.js";

describe("applyCLIEntryRuntimeOptions", () => {
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

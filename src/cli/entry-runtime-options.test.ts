import { describe, expect, it, vi } from "vitest";
import type { CLIAppRuntime } from "./runtime/types.js";
import { applyCLIEntryRuntimeOptions } from "./entry-runtime-options.js";

describe("applyCLIEntryRuntimeOptions", () => {
  it("selects the requested startup model when present", async () => {
    const runtime = {
      selectModel: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, { type: "tui", model: "openai/fast" });

    expect(runtime.selectModel).toHaveBeenCalledWith("openai/fast");
  });

  it("does not select a model when no startup model is present", async () => {
    const runtime = {
      selectModel: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;

    await applyCLIEntryRuntimeOptions(runtime, { type: "tui" });

    expect(runtime.selectModel).not.toHaveBeenCalled();
  });
});

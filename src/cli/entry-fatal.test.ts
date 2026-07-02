import { describe, expect, it, vi } from "vitest";
import { writeCLIEntryFatal } from "./entry-fatal.js";

describe("writeCLIEntryFatal", () => {
  it("prints text fatal errors to stderr", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    writeCLIEntryFatal({ stdout, stderr }, new Error("boom"), "text");

    expect(stderr).toHaveBeenCalledWith("Fatal: boom\n");
    expect(stdout).not.toHaveBeenCalled();
  });

  it("prints json fatal errors to stdout", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    writeCLIEntryFatal({ stdout, stderr }, new Error("boom"), "json");

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"boom\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
  });
});

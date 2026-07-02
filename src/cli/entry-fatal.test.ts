import { describe, expect, it, vi } from "vitest";
import {
  writeCLIEntryError,
  writeCLIEntryConfigTemplateCreated,
  writeCLIEntryFatal,
} from "./entry-fatal.js";
import { ConfigTemplateCreatedError } from "./config.js";

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

describe("writeCLIEntryConfigTemplateCreated", () => {
  it("prints text first-run config creation messages to stdout", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    writeCLIEntryConfigTemplateCreated({ stdout, stderr }, "C:/repo/.cliagent/config.json", "text");

    expect(stdout).toHaveBeenCalledWith([
      "Config template created at C:/repo/.cliagent/config.json",
      "Please add your provider configurations and run again.",
      "",
    ].join("\n"));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints json first-run config creation messages to stdout", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    writeCLIEntryConfigTemplateCreated({ stdout, stderr }, "C:/repo/.cliagent/config.json", "json");

    expect(stdout).toHaveBeenCalledWith([
      "{",
      "  \"ok\": true,",
      "  \"created\": true,",
      "  \"configPath\": \"C:/repo/.cliagent/config.json\",",
      "  \"message\": \"Please add your provider configurations and run again.\"",
      "}\n",
    ].join("\n"));
    expect(stderr).not.toHaveBeenCalled();
  });
});

describe("writeCLIEntryError", () => {
  it("returns zero for first-run config creation signals", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = writeCLIEntryError(
      { stdout, stderr },
      new ConfigTemplateCreatedError("C:/repo/.cliagent/config.json"),
      "json",
    );

    expect(exitCode).toBe(0);
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("\"created\": true"));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("returns one for fatal errors", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    const exitCode = writeCLIEntryError({ stdout, stderr }, new Error("boom"), "text");

    expect(exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith("Fatal: boom\n");
    expect(stdout).not.toHaveBeenCalled();
  });
});

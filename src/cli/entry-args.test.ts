import { describe, expect, it } from "vitest";
import { formatCLIHelp, parseCLIEntryArgs } from "./entry-args.js";

describe("CLI entry args", () => {
  it("opens the TUI when no arguments are provided", () => {
    expect(parseCLIEntryArgs([])).toEqual({ type: "tui" });
  });

  it("opens the TUI for an explicit working directory", () => {
    expect(parseCLIEntryArgs(["--cwd", "C:/repo"])).toEqual({
      type: "tui",
      cwd: "C:/repo",
    });
  });

  it("opens the TUI with an explicit model", () => {
    expect(parseCLIEntryArgs(["--model", "openai/fast"])).toEqual({
      type: "tui",
      model: "openai/fast",
    });
    expect(parseCLIEntryArgs(["-m", "openai/fast"])).toEqual({
      type: "tui",
      model: "openai/fast",
    });
  });

  it("opens the TUI with an initial prompt", () => {
    expect(parseCLIEntryArgs(["explain", "the", "repo"])).toEqual({
      type: "tui",
      prompt: "explain the repo",
    });
  });

  it("opens an explicit working directory with an initial prompt", () => {
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--model", "openai/fast", "fix", "tests"])).toEqual({
      type: "tui",
      cwd: "C:/repo",
      model: "openai/fast",
      prompt: "fix tests",
    });
  });

  it("prints a prompt without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--print", "explain", "the", "repo"])).toEqual({
      type: "print",
      prompt: "explain the repo",
    });
    expect(parseCLIEntryArgs(["-p", "hello"])).toEqual({
      type: "print",
      prompt: "hello",
    });
  });

  it("prints from an explicit working directory", () => {
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--model", "openai/fast", "--print", "fix", "tests"])).toEqual({
      type: "print",
      cwd: "C:/repo",
      model: "openai/fast",
      prompt: "fix tests",
    });
  });

  it("recognizes help flags", () => {
    expect(parseCLIEntryArgs(["--help"])).toEqual({ type: "help" });
    expect(parseCLIEntryArgs(["-h"])).toEqual({ type: "help" });
  });

  it("recognizes version flags", () => {
    expect(parseCLIEntryArgs(["--version"])).toEqual({ type: "version" });
    expect(parseCLIEntryArgs(["-v"])).toEqual({ type: "version" });
  });

  it("rejects unknown arguments before starting the TUI", () => {
    expect(parseCLIEntryArgs(["--wat"])).toEqual({
      type: "error",
      message: "Unknown argument: --wat",
    });
  });

  it("rejects cwd without a path before starting the TUI", () => {
    expect(parseCLIEntryArgs(["--cwd"])).toEqual({
      type: "error",
      message: "Missing path after --cwd",
    });
  });

  it("rejects model without a selector before starting the TUI", () => {
    expect(parseCLIEntryArgs(["--model"])).toEqual({
      type: "error",
      message: "Missing selector after --model",
    });
  });

  it("rejects print mode without a prompt", () => {
    expect(parseCLIEntryArgs(["--print"])).toEqual({
      type: "error",
      message: "Missing prompt for --print",
    });
  });

  it("formats concise help text", () => {
    const help = formatCLIHelp();

    expect(help).toContain("Usage: miniagent");
    expect(help).toContain("--cwd");
    expect(help).toContain("--model");
    expect(help).toContain("--print");
    expect(help).toContain("[prompt]");
    expect(help).toContain("--help");
    expect(help).toContain("--version");
    expect(help).toContain("TUI");
  });
});

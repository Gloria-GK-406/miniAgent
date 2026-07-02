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

  it("opens the TUI for a requested existing session", () => {
    expect(parseCLIEntryArgs(["--session", "s2"])).toEqual({
      type: "tui",
      sessionId: "s2",
    });
    expect(parseCLIEntryArgs(["-s", "s2"])).toEqual({
      type: "tui",
      sessionId: "s2",
    });
  });

  it("opens the TUI with a new named session", () => {
    expect(parseCLIEntryArgs(["--new-session", "feature"])).toEqual({
      type: "tui",
      newSession: "feature",
    });
  });

  it("opens the TUI with an explicit agent mode", () => {
    expect(parseCLIEntryArgs(["--agent", "plan"])).toEqual({
      type: "tui",
      agent: "plan",
    });
  });

  it("opens the TUI with startup auto approval enabled", () => {
    expect(parseCLIEntryArgs(["--auto-approve"])).toEqual({
      type: "tui",
      autoApprove: true,
    });
    expect(parseCLIEntryArgs(["-y"])).toEqual({
      type: "tui",
      autoApprove: true,
    });
  });

  it("opens the TUI with an initial prompt", () => {
    expect(parseCLIEntryArgs(["explain", "the", "repo"])).toEqual({
      type: "tui",
      prompt: "explain the repo",
    });
  });

  it("opens an explicit working directory with an initial prompt", () => {
    expect(parseCLIEntryArgs([
      "--cwd",
      "C:/repo",
      "--session",
      "s2",
      "--auto-approve",
      "--agent",
      "plan",
      "--model",
      "openai/fast",
      "fix",
      "tests",
    ])).toEqual({
      type: "tui",
      agent: "plan",
      autoApprove: true,
      cwd: "C:/repo",
      model: "openai/fast",
      sessionId: "s2",
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

  it("runs doctor checks without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--doctor"])).toEqual({ type: "doctor" });
    expect(parseCLIEntryArgs([
      "--cwd",
      "C:/repo",
      "--session",
      "s2",
      "--model",
      "openai/fast",
      "--doctor",
    ])).toEqual({
      type: "doctor",
      cwd: "C:/repo",
      model: "openai/fast",
      sessionId: "s2",
    });
  });

  it("lists sessions without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--list-sessions"])).toEqual({
      type: "list-sessions",
    });
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--list-sessions"])).toEqual({
      type: "list-sessions",
      cwd: "C:/repo",
    });
  });

  it("prints from an explicit working directory", () => {
    expect(parseCLIEntryArgs([
      "--cwd",
      "C:/repo",
      "--new-session",
      "scratch",
      "--auto-approve",
      "--agent",
      "plan",
      "--model",
      "openai/fast",
      "--print",
      "fix",
      "tests",
    ])).toEqual({
      type: "print",
      agent: "plan",
      autoApprove: true,
      cwd: "C:/repo",
      model: "openai/fast",
      newSession: "scratch",
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

  it("rejects missing or conflicting session startup options", () => {
    expect(parseCLIEntryArgs(["--session"])).toEqual({
      type: "error",
      message: "Missing session id after --session",
    });
    expect(parseCLIEntryArgs(["--new-session"])).toEqual({
      type: "error",
      message: "Missing name after --new-session",
    });
    expect(parseCLIEntryArgs(["--session", "s1", "--new-session", "feature"])).toEqual({
      type: "error",
      message: "Cannot use --session with --new-session",
    });
  });

  it("rejects invalid startup agent modes before starting the TUI", () => {
    expect(parseCLIEntryArgs(["--agent"])).toEqual({
      type: "error",
      message: "Missing mode after --agent",
    });
    expect(parseCLIEntryArgs(["--agent", "review"])).toEqual({
      type: "error",
      message: "Invalid agent mode: review",
    });
  });

  it("rejects print mode without a prompt", () => {
    expect(parseCLIEntryArgs(["--print"])).toEqual({
      type: "error",
      message: "Missing prompt for --print",
    });
  });

  it("rejects conflicting or prompted doctor mode", () => {
    expect(parseCLIEntryArgs(["--doctor", "--print", "hello"])).toEqual({
      type: "error",
      message: "Cannot use --doctor with --print",
    });
    expect(parseCLIEntryArgs(["--doctor", "hello"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --doctor",
    });
  });

  it("rejects conflicting or prompted session listing mode", () => {
    expect(parseCLIEntryArgs(["--list-sessions", "--print", "hello"])).toEqual({
      type: "error",
      message: "Cannot use --list-sessions with --print",
    });
    expect(parseCLIEntryArgs(["--list-sessions", "--doctor"])).toEqual({
      type: "error",
      message: "Cannot use --list-sessions with --doctor",
    });
    expect(parseCLIEntryArgs(["--list-sessions", "hello"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --list-sessions",
    });
  });

  it("formats concise help text", () => {
    const help = formatCLIHelp();

    expect(help).toContain("Usage: miniagent");
    expect(help).toContain("--agent");
    expect(help).toContain("--auto-approve");
    expect(help).toContain("--cwd");
    expect(help).toContain("--model");
    expect(help).toContain("--session");
    expect(help).toContain("--new-session");
    expect(help).toContain("--list-sessions");
    expect(help).toContain("--doctor");
    expect(help).toContain("--print");
    expect(help).toContain("[prompt]");
    expect(help).toContain("--help");
    expect(help).toContain("--version");
    expect(help).toContain("TUI");
  });
});

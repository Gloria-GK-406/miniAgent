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

  it("opens the TUI with an initial prompt file", () => {
    expect(parseCLIEntryArgs(["--prompt-file", "task.md"])).toEqual({
      type: "tui",
      promptFile: "task.md",
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

  it("prints a prompt as json", () => {
    expect(parseCLIEntryArgs(["--print", "--json", "hello"])).toEqual({
      type: "print",
      output: "json",
      prompt: "hello",
    });
  });

  it("prints from a prompt file without a positional prompt", () => {
    expect(parseCLIEntryArgs(["--print", "--prompt-file", "task.md"])).toEqual({
      type: "print",
      promptFile: "task.md",
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

  it("runs doctor checks as json", () => {
    expect(parseCLIEntryArgs(["--doctor", "--json"])).toEqual({
      type: "doctor",
      output: "json",
    });
  });

  it("runs diagnostics without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--diagnostics"])).toEqual({
      type: "diagnostics",
    });
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--diagnostics", "--json"])).toEqual({
      type: "diagnostics",
      cwd: "C:/repo",
      output: "json",
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

  it("lists sessions as json", () => {
    expect(parseCLIEntryArgs(["--list-sessions", "--json"])).toEqual({
      type: "list-sessions",
      output: "json",
    });
  });

  it("lists configured models without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--list-models"])).toEqual({
      type: "list-models",
    });
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--list-models", "--json"])).toEqual({
      type: "list-models",
      cwd: "C:/repo",
      output: "json",
    });
  });

  it("lists slash commands without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--list-commands"])).toEqual({
      type: "list-commands",
    });
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--list-commands", "--json"])).toEqual({
      type: "list-commands",
      cwd: "C:/repo",
      output: "json",
    });
  });

  it("lists tools without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--list-tools"])).toEqual({
      type: "list-tools",
    });
    expect(parseCLIEntryArgs([
      "--cwd",
      "C:/repo",
      "--agent",
      "plan",
      "--model",
      "openai/fast",
      "--list-tools",
      "--json",
    ])).toEqual({
      type: "list-tools",
      agent: "plan",
      cwd: "C:/repo",
      model: "openai/fast",
      output: "json",
    });
  });

  it("lists agents without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--list-agents"])).toEqual({
      type: "list-agents",
    });
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--agent", "plan", "--list-agents", "--json"])).toEqual({
      type: "list-agents",
      agent: "plan",
      cwd: "C:/repo",
      output: "json",
    });
  });

  it("runs read-only git commands without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--git-status"])).toEqual({
      type: "git-headless",
      action: "status",
    });
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--git-log", "3", "--json"])).toEqual({
      type: "git-headless",
      action: "log",
      cwd: "C:/repo",
      limit: 3,
      output: "json",
    });
    expect(parseCLIEntryArgs(["--git-diff", "src/cli", "--staged"])).toEqual({
      type: "git-headless",
      action: "diff",
      path: "src/cli",
      staged: true,
    });
  });

  it("exports a session without opening the TUI", () => {
    expect(parseCLIEntryArgs([
      "--export-session",
      "s1",
      "--format",
      "json",
      "--output",
      "exports/session.json",
      "--json",
    ])).toEqual({
      type: "export-session",
      sessionId: "s1",
      format: "json",
      outputPath: "exports/session.json",
      output: "json",
    });
  });

  it("imports a session without opening the TUI", () => {
    expect(parseCLIEntryArgs([
      "--import-session",
      "exports/session.json",
      "--name",
      "Imported",
      "--json",
    ])).toEqual({
      type: "import-session",
      inputPath: "exports/session.json",
      name: "Imported",
      output: "json",
    });
  });

  it("deletes a session without opening the TUI", () => {
    expect(parseCLIEntryArgs([
      "--delete-session",
      "s1",
      "--json",
    ])).toEqual({
      type: "delete-session",
      sessionId: "s1",
      output: "json",
    });
  });

  it("renames a session without opening the TUI", () => {
    expect(parseCLIEntryArgs([
      "--rename-session",
      "s1",
      "--name",
      "Feature",
      "--json",
    ])).toEqual({
      type: "rename-session",
      sessionId: "s1",
      name: "Feature",
      output: "json",
    });
  });

  it("forks a session without opening the TUI", () => {
    expect(parseCLIEntryArgs([
      "--fork-session",
      "s1",
      "--name",
      "Experiment",
      "--json",
    ])).toEqual({
      type: "fork-session",
      sessionId: "s1",
      name: "Experiment",
      output: "json",
    });
  });

  it("generates shell completion scripts without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--completion", "bash"])).toEqual({
      type: "completion",
      shell: "bash",
    });
    expect(parseCLIEntryArgs(["--completion", "powershell"])).toEqual({
      type: "completion",
      shell: "powershell",
    });
  });

  it("prints config paths without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--config-paths"])).toEqual({
      type: "config-paths",
    });
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--config-paths", "--json"])).toEqual({
      type: "config-paths",
      cwd: "C:/repo",
      output: "json",
    });
  });

  it("prints merged config without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--show-config"])).toEqual({
      type: "show-config",
    });
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--show-config", "--json"])).toEqual({
      type: "show-config",
      cwd: "C:/repo",
      output: "json",
    });
  });

  it("initializes project config without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--init"])).toEqual({
      type: "init",
    });
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--init", "--force", "--json"])).toEqual({
      type: "init",
      cwd: "C:/repo",
      force: true,
      output: "json",
    });
  });

  it("initializes project instructions without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--init-instructions"])).toEqual({
      type: "init-instructions",
    });
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--init-instructions", "--force", "--json"])).toEqual({
      type: "init-instructions",
      cwd: "C:/repo",
      force: true,
      output: "json",
    });
  });

  it("updates permissions without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--set-permission", "write", "deny"])).toEqual({
      type: "permission-update",
      action: "set",
      target: "write",
      decision: "deny",
    });
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--set-permission", "shell:npm *", "allow", "--json"])).toEqual({
      type: "permission-update",
      action: "set",
      cwd: "C:/repo",
      target: "shell:npm *",
      decision: "allow",
      output: "json",
    });
    expect(parseCLIEntryArgs(["--unset-permission", "write", "--json"])).toEqual({
      type: "permission-update",
      action: "unset",
      target: "write",
      output: "json",
    });
  });

  it("updates system prompt without opening the TUI", () => {
    expect(parseCLIEntryArgs(["--set-system-prompt", "Custom prompt.", "--json"])).toEqual({
      type: "system-prompt-update",
      action: "set",
      prompt: "Custom prompt.",
      output: "json",
    });
    expect(parseCLIEntryArgs(["--cwd", "C:/repo", "--system-prompt-file", "prompt.md"])).toEqual({
      type: "system-prompt-update",
      action: "set",
      cwd: "C:/repo",
      promptFile: "prompt.md",
    });
    expect(parseCLIEntryArgs(["--unset-system-prompt", "--json"])).toEqual({
      type: "system-prompt-update",
      action: "unset",
      output: "json",
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

  it("rejects missing or conflicting prompt file input", () => {
    expect(parseCLIEntryArgs(["--prompt-file"])).toEqual({
      type: "error",
      message: "Missing path after --prompt-file",
    });
    expect(parseCLIEntryArgs(["--prompt-file", "task.md", "inline"])).toEqual({
      type: "error",
      message: "Cannot combine --prompt-file with a positional prompt",
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

  it("rejects prompted diagnostics mode", () => {
    expect(parseCLIEntryArgs(["--diagnostics", "hello"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --diagnostics",
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

  it("rejects prompted model listing mode", () => {
    expect(parseCLIEntryArgs(["--list-models", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --list-models",
    });
  });

  it("rejects prompted command listing mode", () => {
    expect(parseCLIEntryArgs(["--list-commands", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --list-commands",
    });
  });

  it("rejects malformed export session options", () => {
    expect(parseCLIEntryArgs(["--export-session", "--format", "xml"])).toEqual({
      type: "error",
      message: "Invalid export format: xml",
    });
    expect(parseCLIEntryArgs(["--export-session", "--output"])).toEqual({
      type: "error",
      message: "Missing path after --output",
    });
    expect(parseCLIEntryArgs(["--export-session", "s1", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --export-session",
    });
  });

  it("rejects malformed import session options", () => {
    expect(parseCLIEntryArgs(["--import-session"])).toEqual({
      type: "error",
      message: "Missing path after --import-session",
    });
    expect(parseCLIEntryArgs(["--import-session", "exports/session.json", "--name"])).toEqual({
      type: "error",
      message: "Missing name after --name",
    });
    expect(parseCLIEntryArgs(["--import-session", "exports/session.json", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --import-session",
    });
  });

  it("rejects malformed delete session options", () => {
    expect(parseCLIEntryArgs(["--delete-session"])).toEqual({
      type: "error",
      message: "Missing session id after --delete-session",
    });
    expect(parseCLIEntryArgs(["--delete-session", "--json"])).toEqual({
      type: "error",
      message: "Missing session id after --delete-session",
    });
    expect(parseCLIEntryArgs(["--delete-session", "s1", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --delete-session",
    });
  });

  it("rejects malformed rename session options", () => {
    expect(parseCLIEntryArgs(["--rename-session"])).toEqual({
      type: "error",
      message: "Missing session id after --rename-session",
    });
    expect(parseCLIEntryArgs(["--rename-session", "--json"])).toEqual({
      type: "error",
      message: "Missing session id after --rename-session",
    });
    expect(parseCLIEntryArgs(["--rename-session", "s1"])).toEqual({
      type: "error",
      message: "Missing name for --rename-session",
    });
    expect(parseCLIEntryArgs(["--rename-session", "s1", "--name", "Feature", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --rename-session",
    });
  });

  it("rejects malformed fork session options", () => {
    expect(parseCLIEntryArgs(["--fork-session"])).toEqual({
      type: "error",
      message: "Missing session id after --fork-session",
    });
    expect(parseCLIEntryArgs(["--fork-session", "--json"])).toEqual({
      type: "error",
      message: "Missing session id after --fork-session",
    });
    expect(parseCLIEntryArgs(["--fork-session", "s1", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --fork-session",
    });
  });

  it("rejects malformed completion options", () => {
    expect(parseCLIEntryArgs(["--completion"])).toEqual({
      type: "error",
      message: "Missing shell after --completion",
    });
    expect(parseCLIEntryArgs(["--completion", "xonsh"])).toEqual({
      type: "error",
      message: "Invalid completion shell: xonsh",
    });
    expect(parseCLIEntryArgs(["--completion", "bash", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --completion",
    });
    expect(parseCLIEntryArgs(["--completion", "bash", "--json"])).toEqual({
      type: "error",
      message: "Cannot use --json with --completion",
    });
  });

  it("rejects prompted config paths mode", () => {
    expect(parseCLIEntryArgs(["--config-paths", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --config-paths",
    });
  });

  it("rejects prompted show config mode", () => {
    expect(parseCLIEntryArgs(["--show-config", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --show-config",
    });
  });

  it("rejects malformed init options", () => {
    expect(parseCLIEntryArgs(["--init", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --init",
    });
    expect(parseCLIEntryArgs(["--init-instructions", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --init-instructions",
    });
    expect(parseCLIEntryArgs(["--force"])).toEqual({
      type: "error",
      message: "Cannot use --force without --init or --init-instructions",
    });
  });

  it("rejects malformed git headless options", () => {
    expect(parseCLIEntryArgs(["--git-log", "src"])).toEqual({
      type: "error",
      message: "Invalid limit after --git-log: src",
    });
    expect(parseCLIEntryArgs(["--staged"])).toEqual({
      type: "error",
      message: "Cannot use --staged without --git-diff",
    });
    expect(parseCLIEntryArgs(["--git-status", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --git-status",
    });
  });

  it("rejects malformed permission update options", () => {
    expect(parseCLIEntryArgs(["--set-permission"])).toEqual({
      type: "error",
      message: "Missing target after --set-permission",
    });
    expect(parseCLIEntryArgs(["--set-permission", "write"])).toEqual({
      type: "error",
      message: "Missing decision after --set-permission",
    });
    expect(parseCLIEntryArgs(["--set-permission", "write", "sometimes"])).toEqual({
      type: "error",
      message: "Invalid permission decision: sometimes",
    });
    expect(parseCLIEntryArgs(["--unset-permission"])).toEqual({
      type: "error",
      message: "Missing target after --unset-permission",
    });
    expect(parseCLIEntryArgs(["--unset-permission", "write", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --unset-permission",
    });
  });

  it("rejects malformed system prompt update options", () => {
    expect(parseCLIEntryArgs(["--set-system-prompt"])).toEqual({
      type: "error",
      message: "Missing prompt after --set-system-prompt",
    });
    expect(parseCLIEntryArgs(["--system-prompt-file"])).toEqual({
      type: "error",
      message: "Missing path after --system-prompt-file",
    });
    expect(parseCLIEntryArgs(["--set-system-prompt", "prompt", "--system-prompt-file", "prompt.md"])).toEqual({
      type: "error",
      message: "Cannot combine --set-system-prompt with --system-prompt-file",
    });
    expect(parseCLIEntryArgs(["--unset-system-prompt", "prompt"])).toEqual({
      type: "error",
      message: "Unexpected prompt for --unset-system-prompt",
    });
  });

  it("rejects json output for interactive TUI mode", () => {
    expect(parseCLIEntryArgs(["--json"])).toEqual({
      type: "error",
      message: "Cannot use --json without --print, --doctor, --diagnostics, --config-paths, --show-config, --init, --init-instructions, --set-permission, --unset-permission, --set-system-prompt, --system-prompt-file, --unset-system-prompt, --git-status, --git-log, --git-diff, --list-sessions, --list-models, --list-commands, --list-tools, --list-agents, --export-session, --import-session, --delete-session, --rename-session, or --fork-session",
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
    expect(help).toContain("--list-models");
    expect(help).toContain("--list-commands");
    expect(help).toContain("--list-tools");
    expect(help).toContain("--list-agents");
    expect(help).toContain("--git-status");
    expect(help).toContain("--git-log");
    expect(help).toContain("--git-diff");
    expect(help).toContain("--diagnostics");
    expect(help).toContain("--export-session");
    expect(help).toContain("--import-session");
    expect(help).toContain("--delete-session");
    expect(help).toContain("--rename-session");
    expect(help).toContain("--fork-session");
    expect(help).toContain("--completion");
    expect(help).toContain("--config-paths");
    expect(help).toContain("--show-config");
    expect(help).toContain("--init");
    expect(help).toContain("--init-instructions");
    expect(help).toContain("--force");
    expect(help).toContain("--set-permission");
    expect(help).toContain("--unset-permission");
    expect(help).toContain("--set-system-prompt");
    expect(help).toContain("--system-prompt-file");
    expect(help).toContain("--unset-system-prompt");
    expect(help).toContain("--name");
    expect(help).toContain("--format");
    expect(help).toContain("--output");
    expect(help).toContain("--doctor");
    expect(help).toContain("--json");
    expect(help).toContain("--print");
    expect(help).toContain("--prompt-file");
    expect(help).toContain("[prompt]");
    expect(help).toContain("--help");
    expect(help).toContain("--version");
    expect(help).toContain("TUI");
  });
});

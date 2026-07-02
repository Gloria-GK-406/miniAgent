export type CLIEntryAction =
  | { type: "tui"; cwd?: string }
  | { type: "help" }
  | { type: "version" }
  | { type: "error"; message: string };

export function parseCLIEntryArgs(args: string[]): CLIEntryAction {
  if (args.length === 0) {
    return { type: "tui" };
  }

  const first = args[0]!;
  if (first === "--cwd") {
    const cwd = args[1];
    if (cwd === undefined || cwd.trim().length === 0) {
      return { type: "error", message: "Missing path after --cwd" };
    }
    return { type: "tui", cwd };
  }
  if (first === "--help" || first === "-h") {
    return { type: "help" };
  }
  if (first === "--version" || first === "-v") {
    return { type: "version" };
  }
  return { type: "error", message: `Unknown argument: ${first}` };
}

export function formatCLIHelp(): string {
  return [
    "Usage: miniagent [options]",
    "",
    "Open the MiniAgent single-process coding-agent TUI for the current project.",
    "",
    "Options:",
    "  --cwd <path>    Open the TUI for a specific project directory",
    "  -h, --help      Show this help text",
    "  -v, --version   Show package version",
  ].join("\n");
}

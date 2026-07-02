export type CLIEntryAction =
  | { type: "tui" }
  | { type: "help" }
  | { type: "version" }
  | { type: "error"; message: string };

export function parseCLIEntryArgs(args: string[]): CLIEntryAction {
  if (args.length === 0) {
    return { type: "tui" };
  }

  const first = args[0]!;
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
    "  -h, --help      Show this help text",
    "  -v, --version   Show package version",
  ].join("\n");
}

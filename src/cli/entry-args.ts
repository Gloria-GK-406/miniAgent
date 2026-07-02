export type CLIEntryAction =
  | { type: "tui"; cwd?: string; prompt?: string }
  | { type: "print"; cwd?: string; prompt: string }
  | { type: "help" }
  | { type: "version" }
  | { type: "error"; message: string };

export function parseCLIEntryArgs(args: string[]): CLIEntryAction {
  let cwd: string | undefined;
  let printMode = false;
  const promptParts: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--help" || arg === "-h") {
      return { type: "help" };
    }
    if (arg === "--version" || arg === "-v") {
      return { type: "version" };
    }
    if (arg === "--print" || arg === "-p") {
      printMode = true;
      continue;
    }
    if (arg === "--cwd") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0) {
        return { type: "error", message: "Missing path after --cwd" };
      }
      cwd = next;
      index++;
      continue;
    }
    if (arg.startsWith("-")) {
      return { type: "error", message: `Unknown argument: ${arg}` };
    }
    promptParts.push(...args.slice(index));
    break;
  }

  const prompt = promptParts.join(" ").trim();
  if (printMode) {
    if (prompt.length === 0) {
      return { type: "error", message: "Missing prompt for --print" };
    }
    return {
      type: "print",
      ...(cwd !== undefined && { cwd }),
      prompt,
    };
  }

  return {
    type: "tui",
    ...(cwd !== undefined && { cwd }),
    ...(prompt.length > 0 && { prompt }),
  };
}

export function formatCLIHelp(): string {
  return [
    "Usage: miniagent [options] [prompt]",
    "",
    "Open the MiniAgent single-process coding-agent TUI for the current project.",
    "",
    "Arguments:",
    "  prompt          Submit an initial prompt after the TUI opens",
    "",
    "Options:",
    "  --cwd <path>    Open the TUI for a specific project directory",
    "  -p, --print     Run one prompt headlessly and print the final response",
    "  -h, --help      Show this help text",
    "  -v, --version   Show package version",
  ].join("\n");
}

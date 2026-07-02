export type CLIEntryAgentMode = "build" | "plan";

export type CLIEntryAction =
  | { type: "tui"; agent?: CLIEntryAgentMode; autoApprove?: boolean; cwd?: string; model?: string; prompt?: string }
  | { type: "print"; agent?: CLIEntryAgentMode; autoApprove?: boolean; cwd?: string; model?: string; prompt: string }
  | { type: "help" }
  | { type: "version" }
  | { type: "error"; message: string };

export function parseCLIEntryArgs(args: string[]): CLIEntryAction {
  let agent: CLIEntryAgentMode | undefined;
  let autoApprove = false;
  let cwd: string | undefined;
  let model: string | undefined;
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
    if (arg === "--auto-approve" || arg === "-y") {
      autoApprove = true;
      continue;
    }
    if (arg === "--agent") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0) {
        return { type: "error", message: "Missing mode after --agent" };
      }
      if (next !== "build" && next !== "plan") {
        return { type: "error", message: `Invalid agent mode: ${next}` };
      }
      agent = next;
      index++;
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
    if (arg === "--model" || arg === "-m") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0) {
        return { type: "error", message: "Missing selector after --model" };
      }
      model = next;
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
      ...(agent !== undefined && { agent }),
      ...(autoApprove && { autoApprove: true }),
      ...(cwd !== undefined && { cwd }),
      ...(model !== undefined && { model }),
      prompt,
    };
  }

  return {
    type: "tui",
    ...(agent !== undefined && { agent }),
    ...(autoApprove && { autoApprove: true }),
    ...(cwd !== undefined && { cwd }),
    ...(model !== undefined && { model }),
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
    "  --agent <mode>  Start in build or plan mode",
    "  -y, --auto-approve",
    "                  Auto-approve CLI tool calls for this run",
    "  --cwd <path>    Open the TUI for a specific project directory",
    "  -m, --model     Select a configured model by id or provider/id",
    "  -p, --print     Run one prompt headlessly and print the final response",
    "  -h, --help      Show this help text",
    "  -v, --version   Show package version",
  ].join("\n");
}

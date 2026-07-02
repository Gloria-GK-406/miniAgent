export type CLIEntryAgentMode = "build" | "plan";
export type CLIEntryOutput = "text" | "json";

export type CLIEntryAction =
  | {
    type: "tui";
    agent?: CLIEntryAgentMode;
    autoApprove?: boolean;
    cwd?: string;
    model?: string;
    sessionId?: string;
    newSession?: string;
    prompt?: string;
  }
  | {
    type: "print";
    agent?: CLIEntryAgentMode;
    autoApprove?: boolean;
    cwd?: string;
    model?: string;
    sessionId?: string;
    newSession?: string;
    output?: CLIEntryOutput;
    prompt: string;
  }
  | {
    type: "doctor";
    agent?: CLIEntryAgentMode;
    autoApprove?: boolean;
    cwd?: string;
    model?: string;
    sessionId?: string;
    newSession?: string;
    output?: CLIEntryOutput;
  }
  | { type: "list-sessions"; cwd?: string; output?: CLIEntryOutput }
  | { type: "help" }
  | { type: "version" }
  | { type: "error"; message: string };

export function parseCLIEntryArgs(args: string[]): CLIEntryAction {
  let agent: CLIEntryAgentMode | undefined;
  let autoApprove = false;
  let cwd: string | undefined;
  let model: string | undefined;
  let sessionId: string | undefined;
  let newSession: string | undefined;
  let printMode = false;
  let doctorMode = false;
  let listSessionsMode = false;
  let output: CLIEntryOutput | undefined;
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
    if (arg === "--doctor") {
      doctorMode = true;
      continue;
    }
    if (arg === "--list-sessions") {
      listSessionsMode = true;
      continue;
    }
    if (arg === "--json") {
      output = "json";
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
    if (arg === "--session" || arg === "-s") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0) {
        return { type: "error", message: "Missing session id after --session" };
      }
      sessionId = next;
      index++;
      continue;
    }
    if (arg === "--new-session") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0) {
        return { type: "error", message: "Missing name after --new-session" };
      }
      newSession = next;
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
  if (sessionId !== undefined && newSession !== undefined) {
    return { type: "error", message: "Cannot use --session with --new-session" };
  }
  if (doctorMode && printMode) {
    return { type: "error", message: "Cannot use --doctor with --print" };
  }
  if (listSessionsMode && printMode) {
    return { type: "error", message: "Cannot use --list-sessions with --print" };
  }
  if (listSessionsMode && doctorMode) {
    return { type: "error", message: "Cannot use --list-sessions with --doctor" };
  }
  if (listSessionsMode) {
    if (prompt.length > 0) {
      return { type: "error", message: "Unexpected prompt for --list-sessions" };
    }
    return {
      type: "list-sessions",
      ...(cwd !== undefined && { cwd }),
      ...(output !== undefined && { output }),
    };
  }
  if (doctorMode) {
    if (prompt.length > 0) {
      return { type: "error", message: "Unexpected prompt for --doctor" };
    }
    return {
      type: "doctor",
      ...(agent !== undefined && { agent }),
      ...(autoApprove && { autoApprove: true }),
      ...(cwd !== undefined && { cwd }),
      ...(model !== undefined && { model }),
      ...(sessionId !== undefined && { sessionId }),
      ...(newSession !== undefined && { newSession }),
      ...(output !== undefined && { output }),
    };
  }

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
      ...(sessionId !== undefined && { sessionId }),
      ...(newSession !== undefined && { newSession }),
      ...(output !== undefined && { output }),
      prompt,
    };
  }
  if (output !== undefined) {
    return {
      type: "error",
      message: "Cannot use --json without --print, --doctor, or --list-sessions",
    };
  }

  return {
    type: "tui",
    ...(agent !== undefined && { agent }),
    ...(autoApprove && { autoApprove: true }),
    ...(cwd !== undefined && { cwd }),
    ...(model !== undefined && { model }),
    ...(sessionId !== undefined && { sessionId }),
    ...(newSession !== undefined && { newSession }),
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
    "  -s, --session   Resume a session by id",
    "  --new-session   Create and start in a named session",
    "  --list-sessions List sessions headlessly",
    "  -m, --model     Select a configured model by id or provider/id",
    "  --doctor        Run setup checks headlessly",
    "  --json          Emit JSON for supported headless modes",
    "  -p, --print     Run one prompt headlessly and print the final response",
    "  -h, --help      Show this help text",
    "  -v, --version   Show package version",
  ].join("\n");
}

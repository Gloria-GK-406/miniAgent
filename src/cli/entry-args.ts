export type CLIEntryAgentMode = "build" | "plan";
export type CLIEntryOutput = "text" | "json";
export type CLIEntryExportFormat = "json" | "markdown";

export type CLIEntryAction =
  | {
    type: "tui";
    agent?: CLIEntryAgentMode;
    autoApprove?: boolean;
    cwd?: string;
    model?: string;
    sessionId?: string;
    newSession?: string;
    promptFile?: string;
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
    prompt?: string;
    promptFile?: string;
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
  | { type: "diagnostics"; cwd?: string; output?: CLIEntryOutput }
  | { type: "list-sessions"; cwd?: string; output?: CLIEntryOutput }
  | {
    type: "export-session";
    cwd?: string;
    sessionId?: string;
    format?: CLIEntryExportFormat;
    outputPath?: string;
    output?: CLIEntryOutput;
  }
  | {
    type: "import-session";
    cwd?: string;
    inputPath: string;
    name?: string;
    output?: CLIEntryOutput;
  }
  | {
    type: "delete-session";
    cwd?: string;
    sessionId: string;
    output?: CLIEntryOutput;
  }
  | {
    type: "rename-session";
    cwd?: string;
    sessionId: string;
    name: string;
    output?: CLIEntryOutput;
  }
  | {
    type: "fork-session";
    cwd?: string;
    sessionId: string;
    name?: string;
    output?: CLIEntryOutput;
  }
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
  let diagnosticsMode = false;
  let listSessionsMode = false;
  let exportSessionMode = false;
  let importSessionMode = false;
  let deleteSessionMode = false;
  let renameSessionMode = false;
  let forkSessionMode = false;
  let exportFormat: CLIEntryExportFormat | undefined;
  let outputPath: string | undefined;
  let importInputPath: string | undefined;
  let importName: string | undefined;
  let output: CLIEntryOutput | undefined;
  let promptFile: string | undefined;
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
    if (arg === "--diagnostics") {
      diagnosticsMode = true;
      continue;
    }
    if (arg === "--list-sessions") {
      listSessionsMode = true;
      continue;
    }
    if (arg === "--export-session") {
      exportSessionMode = true;
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        sessionId = next;
        index++;
      }
      continue;
    }
    if (arg === "--import-session") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0) {
        return { type: "error", message: "Missing path after --import-session" };
      }
      importSessionMode = true;
      importInputPath = next;
      index++;
      continue;
    }
    if (arg === "--delete-session") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0 || next.startsWith("-")) {
        return { type: "error", message: "Missing session id after --delete-session" };
      }
      deleteSessionMode = true;
      sessionId = next;
      index++;
      continue;
    }
    if (arg === "--rename-session") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0 || next.startsWith("-")) {
        return { type: "error", message: "Missing session id after --rename-session" };
      }
      renameSessionMode = true;
      sessionId = next;
      index++;
      continue;
    }
    if (arg === "--fork-session") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0 || next.startsWith("-")) {
        return { type: "error", message: "Missing session id after --fork-session" };
      }
      forkSessionMode = true;
      sessionId = next;
      index++;
      continue;
    }
    if (arg === "--name") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0) {
        return { type: "error", message: "Missing name after --name" };
      }
      importName = next;
      index++;
      continue;
    }
    if (arg === "--json") {
      output = "json";
      continue;
    }
    if (arg === "--format") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0) {
        return { type: "error", message: "Missing format after --format" };
      }
      if (next !== "json" && next !== "markdown") {
        return { type: "error", message: `Invalid export format: ${next}` };
      }
      exportFormat = next;
      index++;
      continue;
    }
    if (arg === "--output") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0) {
        return { type: "error", message: "Missing path after --output" };
      }
      outputPath = next;
      index++;
      continue;
    }
    if (arg === "--prompt-file") {
      const next = args[index + 1];
      if (next === undefined || next.trim().length === 0) {
        return { type: "error", message: "Missing path after --prompt-file" };
      }
      promptFile = next;
      index++;
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
  if (promptFile !== undefined && prompt.length > 0) {
    return { type: "error", message: "Cannot combine --prompt-file with a positional prompt" };
  }
  if (doctorMode && printMode) {
    return { type: "error", message: "Cannot use --doctor with --print" };
  }
  if (diagnosticsMode && (printMode || doctorMode || listSessionsMode || exportSessionMode || importSessionMode)) {
    return { type: "error", message: "Cannot combine --diagnostics with another headless mode" };
  }
  if (deleteSessionMode && (printMode || doctorMode || diagnosticsMode || listSessionsMode || exportSessionMode || importSessionMode)) {
    return { type: "error", message: "Cannot combine --delete-session with another headless mode" };
  }
  if (renameSessionMode && (printMode || doctorMode || diagnosticsMode || listSessionsMode || exportSessionMode || importSessionMode || deleteSessionMode || forkSessionMode)) {
    return { type: "error", message: "Cannot combine --rename-session with another headless mode" };
  }
  if (forkSessionMode && (printMode || doctorMode || diagnosticsMode || listSessionsMode || exportSessionMode || importSessionMode || deleteSessionMode || renameSessionMode)) {
    return { type: "error", message: "Cannot combine --fork-session with another headless mode" };
  }
  if (listSessionsMode && printMode) {
    return { type: "error", message: "Cannot use --list-sessions with --print" };
  }
  if (listSessionsMode && doctorMode) {
    return { type: "error", message: "Cannot use --list-sessions with --doctor" };
  }
  if (exportSessionMode && (printMode || doctorMode || listSessionsMode)) {
    return { type: "error", message: "Cannot combine --export-session with another headless mode" };
  }
  if (importSessionMode && (printMode || doctorMode || listSessionsMode || exportSessionMode)) {
    return { type: "error", message: "Cannot combine --import-session with another headless mode" };
  }
  if (diagnosticsMode) {
    if (prompt.length > 0) {
      return { type: "error", message: "Unexpected prompt for --diagnostics" };
    }
    return {
      type: "diagnostics",
      ...(cwd !== undefined && { cwd }),
      ...(output !== undefined && { output }),
    };
  }
  if (deleteSessionMode) {
    if (prompt.length > 0) {
      return { type: "error", message: "Unexpected prompt for --delete-session" };
    }
    return {
      type: "delete-session",
      sessionId: sessionId!,
      ...(cwd !== undefined && { cwd }),
      ...(output !== undefined && { output }),
    };
  }
  if (renameSessionMode) {
    if (prompt.length > 0) {
      return { type: "error", message: "Unexpected prompt for --rename-session" };
    }
    if (importName === undefined) {
      return { type: "error", message: "Missing name for --rename-session" };
    }
    return {
      type: "rename-session",
      sessionId: sessionId!,
      name: importName,
      ...(cwd !== undefined && { cwd }),
      ...(output !== undefined && { output }),
    };
  }
  if (forkSessionMode) {
    if (prompt.length > 0) {
      return { type: "error", message: "Unexpected prompt for --fork-session" };
    }
    return {
      type: "fork-session",
      sessionId: sessionId!,
      ...(cwd !== undefined && { cwd }),
      ...(importName !== undefined && { name: importName }),
      ...(output !== undefined && { output }),
    };
  }
  if (importSessionMode) {
    if (prompt.length > 0) {
      return { type: "error", message: "Unexpected prompt for --import-session" };
    }
    return {
      type: "import-session",
      inputPath: importInputPath!,
      ...(cwd !== undefined && { cwd }),
      ...(importName !== undefined && { name: importName }),
      ...(output !== undefined && { output }),
    };
  }
  if (exportSessionMode) {
    if (prompt.length > 0) {
      return { type: "error", message: "Unexpected prompt for --export-session" };
    }
    return {
      type: "export-session",
      ...(cwd !== undefined && { cwd }),
      ...(sessionId !== undefined && { sessionId }),
      ...(exportFormat !== undefined && { format: exportFormat }),
      ...(outputPath !== undefined && { outputPath }),
      ...(output !== undefined && { output }),
    };
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
    if (prompt.length === 0 && promptFile === undefined) {
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
      ...(prompt.length > 0 && { prompt }),
      ...(promptFile !== undefined && { promptFile }),
    };
  }
  if (output !== undefined) {
    return {
      type: "error",
      message: "Cannot use --json without --print, --doctor, --diagnostics, --list-sessions, --export-session, --import-session, --delete-session, --rename-session, or --fork-session",
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
    ...(promptFile !== undefined && { promptFile }),
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
    "  --export-session Export a session headlessly",
    "  --import-session Import a session export headlessly",
    "  --delete-session Delete a session headlessly",
    "  --rename-session Rename a session headlessly",
    "  --fork-session Fork a session headlessly",
    "  --name           Set imported session name",
    "  --format         Set export format: json or markdown",
    "  --output         Set export output path",
    "  -m, --model     Select a configured model by id or provider/id",
    "  --doctor        Run setup checks headlessly",
    "  --diagnostics   Run configured diagnostics headlessly",
    "  --json          Emit JSON for supported headless modes",
    "  -p, --print     Run one prompt headlessly and print the final response",
    "  --prompt-file   Read the initial prompt from a file",
    "  -h, --help      Show this help text",
    "  -v, --version   Show package version",
  ].join("\n");
}

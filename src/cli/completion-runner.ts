export type CompletionShell = "bash" | "zsh" | "fish" | "powershell";

interface CompletionOption {
  long: string;
  short?: string;
  description: string;
  values?: string[];
}

const COMPLETION_OPTIONS: CompletionOption[] = [
  { long: "--agent", description: "Start in build or plan mode", values: ["build", "plan"] },
  { long: "--auto-approve", short: "-y", description: "Auto-approve CLI tool calls" },
  { long: "--cwd", description: "Open for a project directory" },
  { long: "--session", short: "-s", description: "Resume a session by id" },
  { long: "--new-session", description: "Create and start in a named session" },
  { long: "--list-sessions", description: "List sessions headlessly" },
  { long: "--list-commands", description: "List slash commands headlessly" },
  { long: "--list-tools", description: "List runtime tools headlessly" },
  { long: "--list-agents", description: "List primary and configured agents headlessly" },
  { long: "--git-status", description: "Print git status headlessly" },
  { long: "--git-log", description: "Print recent git commits headlessly" },
  { long: "--git-diff", description: "Print git diff headlessly" },
  { long: "--staged", description: "Show staged git diff" },
  { long: "--export-session", description: "Export a session headlessly" },
  { long: "--import-session", description: "Import a session export headlessly" },
  { long: "--delete-session", description: "Delete a session headlessly" },
  { long: "--rename-session", description: "Rename a session headlessly" },
  { long: "--fork-session", description: "Fork a session headlessly" },
  { long: "--name", description: "Set a session name" },
  { long: "--format", description: "Set export format", values: ["json", "markdown"] },
  { long: "--output", description: "Set export output path" },
  { long: "--model", short: "-m", description: "Select a configured model" },
  { long: "--doctor", description: "Run setup checks headlessly" },
  { long: "--diagnostics", description: "Run configured diagnostics headlessly" },
  { long: "--init-instructions", description: "Create AGENTS.md project guidance" },
  { long: "--json", description: "Emit JSON for supported headless modes" },
  { long: "--set-permission", description: "Set a project permission rule" },
  { long: "--unset-permission", description: "Unset a project permission rule" },
  { long: "--set-system-prompt", description: "Set the project system prompt" },
  { long: "--system-prompt-file", description: "Read project system prompt from a file" },
  { long: "--unset-system-prompt", description: "Unset the project system prompt" },
  { long: "--print", short: "-p", description: "Run one prompt headlessly" },
  { long: "--prompt-file", description: "Read the initial prompt from a file" },
  { long: "--completion", description: "Generate shell completions", values: ["bash", "zsh", "fish", "powershell"] },
  { long: "--help", short: "-h", description: "Show help text" },
  { long: "--version", short: "-v", description: "Show package version" },
];

function completionWords(): string {
  return COMPLETION_OPTIONS
    .flatMap((option) => option.short === undefined ? [option.long] : [option.long, option.short])
    .join(" ");
}

function formatBashCompletion(): string {
  return [
    "_miniagent_completion() {",
    "  local cur=\"${COMP_WORDS[COMP_CWORD]}\"",
    `  COMPREPLY=( $(compgen -W "${completionWords()}" -- "$cur") )`,
    "}",
    "complete -F _miniagent_completion miniagent",
    "",
  ].join("\n");
}

function formatZshCompletion(): string {
  const specs = COMPLETION_OPTIONS.map((option) => {
    const names = option.short === undefined ? option.long : `${option.short},${option.long}`;
    const values = option.values === undefined ? "" : `:value:(${option.values.join(" ")})`;
    return `  '${names}[${option.description}]${values}' \\`;
  });
  return [
    "#compdef miniagent",
    "_miniagent() {",
    "  _arguments \\",
    ...specs,
    "    '*:prompt:_normal'",
    "}",
    "_miniagent \"$@\"",
    "",
  ].join("\n");
}

function formatFishCompletion(): string {
  return `${COMPLETION_OPTIONS.flatMap((option) => {
    const base = [`complete -c miniagent -l ${option.long.slice(2)} -d '${option.description}'`];
    if (option.short !== undefined) {
      base.push(`complete -c miniagent -s ${option.short.slice(1)} -d '${option.description}'`);
    }
    return base;
  }).join("\n")}\n`;
}

function formatPowerShellCompletion(): string {
  return [
    "$script:MiniAgentOptions = @(",
    ...completionWords().split(" ").map((word) => `  '${word}'`),
    ")",
    "Register-ArgumentCompleter -Native -CommandName miniagent -ScriptBlock {",
    "  param($wordToComplete)",
    "  $script:MiniAgentOptions | Where-Object { $_ -like \"$wordToComplete*\" } | ForEach-Object {",
    "    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)",
    "  }",
    "}",
    "",
  ].join("\n");
}

export function formatCompletionScript(shell: CompletionShell): string {
  switch (shell) {
    case "bash":
      return formatBashCompletion();
    case "zsh":
      return formatZshCompletion();
    case "fish":
      return formatFishCompletion();
    case "powershell":
      return formatPowerShellCompletion();
  }
}

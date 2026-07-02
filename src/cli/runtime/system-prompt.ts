import type { CLIAgentMode, CLIConfig } from "../config.js";

export function getBaseSystemPrompt(config: Pick<CLIConfig, "systemPrompt">): string {
  return config.systemPrompt ?? "You are a helpful assistant.";
}

export interface BuildEffectiveSystemPromptOptions {
  baseDir: string;
  mode: CLIAgentMode;
  userSystemPrompt: string;
}

export function buildEffectiveSystemPrompt({
  baseDir,
  mode,
  userSystemPrompt,
}: BuildEffectiveSystemPromptOptions): string {
  return [
    userSystemPrompt,
    "",
    `Working directory: ${baseDir}`,
    `Agent mode: ${mode}`,
    "You have access to tools for reading, writing, editing, searching files, executing shell commands, managing tasks, and spawning sub-agents.",
    "Use tools proactively to accomplish tasks. For file operations, always use the appropriate tool.",
  ].join("\n");
}

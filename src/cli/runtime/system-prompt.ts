import { z } from "zod";
import { CLIAgentModeSchema, type CLIAgentMode, type CLIConfig } from "../config.js";

export function getBaseSystemPrompt(config: Pick<CLIConfig, "systemPrompt">): string {
  return config.systemPrompt ?? "You are a helpful assistant.";
}

export const BuildEffectiveSystemPromptOptionsSchema = z.object({
  baseDir: z.string(),
  mode: z.lazy(() => CLIAgentModeSchema),
  userSystemPrompt: z.string(),
}) as z.ZodType<{
  baseDir: string;
  mode: CLIAgentMode;
  userSystemPrompt: string;
}>;
export type BuildEffectiveSystemPromptOptions = z.infer<typeof BuildEffectiveSystemPromptOptionsSchema>;

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

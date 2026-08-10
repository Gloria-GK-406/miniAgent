import { z } from "zod";
import { registerBuiltinCommands } from "./commands/builtin.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";
import {
  addCommandRegistrationNames,
  findCommandNamespaceConflict,
  getCommandRegistrationNames,
} from "./runtime/command-namespace.js";
import { createCommandRegistry } from "./runtime/command-registry.js";
import { loadCustomCommands } from "./runtime/custom-command-service.js";
import type { CLICommand } from "./runtime/types.js";

export const CommandListOutputSchema = z.enum(["text", "json"]);
export type CommandListOutput = z.infer<typeof CommandListOutputSchema>;
export const CommandListSourceSchema = z.enum(["builtin", "custom"]);
export type CommandListSource = z.infer<typeof CommandListSourceSchema>;

export const CommandListRequestSchema = z.object({
  baseDir: z.string(),
  output: CommandListOutputSchema.optional(),
});
export type CommandListRequest = z.infer<typeof CommandListRequestSchema>;

export const CommandListItemSchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()),
  description: z.string(),
  usage: z.string(),
  source: CommandListSourceSchema,
});
export type CommandListItem = z.infer<typeof CommandListItemSchema>;

function toCommandListItem(command: CLICommand, source: CommandListSource): CommandListItem {
  return {
    name: command.name,
    aliases: command.aliases ?? [],
    description: command.description,
    usage: command.usage,
    source,
  };
}

function visibleCommandItems(commands: CLICommand[], source: CommandListSource): CommandListItem[] {
  return commands
    .filter((command) => command.hidden !== true)
    .map((command) => toCommandListItem(command, source));
}

function commandSortKey(command: CommandListItem): string {
  return `${command.source === "builtin" ? "0" : "1"}:${command.name}`;
}

export async function listAvailableCommands(baseDir: string): Promise<CommandListItem[]> {
  const registry = createCommandRegistry();
  registerBuiltinCommands(registry);
  const builtinCommands = registry.list();
  const reservedNames = new Set(builtinCommands.flatMap(getCommandRegistrationNames));
  const customCommands: CLICommand[] = [];
  for (const command of await loadCustomCommands(baseDir)) {
    if (findCommandNamespaceConflict(command, reservedNames) !== undefined) {
      continue;
    }
    customCommands.push(command);
    addCommandRegistrationNames(reservedNames, command);
  }

  return [
    ...visibleCommandItems(builtinCommands, "builtin"),
    ...visibleCommandItems(customCommands, "custom"),
  ].sort((left, right) => commandSortKey(left).localeCompare(commandSortKey(right)));
}

export function formatCommandList(commands: CommandListItem[]): string {
  if (commands.length === 0) {
    return "No commands available\n";
  }

  return `${commands.map((command) => {
    const aliases = command.aliases.length > 0
      ? ` (${command.aliases.map((alias) => `/${alias}`).join(", ")})`
      : "";
    const source = command.source === "custom" ? " [custom]" : "";
    return [
      `/${command.name}${aliases} - ${command.description}${source}`,
      `  usage: ${command.usage}`,
    ].join("\n");
  }).join("\n")}\n`;
}

export function formatCommandListJson(commands: CommandListItem[]): string {
  return `${JSON.stringify({ commands }, null, 2)}\n`;
}

export async function runCommandList(
  request: CommandListRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const commands = await listAvailableCommands(request.baseDir);
    streams.stdout(
      output === "json"
        ? formatCommandListJson(commands)
        : formatCommandList(commands),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

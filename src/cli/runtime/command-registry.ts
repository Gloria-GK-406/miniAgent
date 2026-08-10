import { type z } from "zod";
import { createFunctionSchema, createProtocolSchema } from "../../core/index.js";
import type { CLICommand, CLICommandContext } from "./types.js";

export const CommandRegistrySchema = createProtocolSchema({
  register: createFunctionSchema<(command: CLICommand) => void>(),
  list: createFunctionSchema<() => CLICommand[]>(),
  execute: createFunctionSchema<(
    ctx: CLICommandContext,
    input: string,
  ) => Promise<void>>(),
  complete: createFunctionSchema<(
    ctx: CLICommandContext,
    input: string,
  ) => Promise<string[]>>(),
});
export type CommandRegistry = z.infer<typeof CommandRegistrySchema>;

function normalizeName(value: string): string {
  return value.startsWith("/") ? value.slice(1) : value;
}

function parseCommandInput(input: string): { name: string; args: string } {
  const trimmed = input.trim();
  const withoutSlash = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const space = withoutSlash.indexOf(" ");
  if (space === -1) {
    return { name: withoutSlash, args: "" };
  }
  return {
    name: withoutSlash.slice(0, space),
    args: withoutSlash.slice(space + 1).trim(),
  };
}

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, CLICommand>();
  const aliases = new Map<string, string>();

  function requireCommand(name: string): CLICommand {
    const normalized = normalizeName(name);
    const canonical = aliases.get(normalized) ?? normalized;
    const command = commands.get(canonical);
    if (command === undefined) {
      throw new Error(`Unknown command: /${normalized}`);
    }
    return command;
  }

  return {
    register: (command): void => {
      const name = normalizeName(command.name);
      if (commands.has(name)) {
        throw new Error(`Command already registered: /${name}`);
      }
      commands.set(name, { ...command, name });
      for (const alias of command.aliases ?? []) {
        const normalizedAlias = normalizeName(alias);
        if (aliases.has(normalizedAlias) || commands.has(normalizedAlias)) {
          throw new Error(`Command alias already registered: /${normalizedAlias}`);
        }
        aliases.set(normalizedAlias, name);
      }
    },
    list: (): CLICommand[] => [...commands.values()],
    execute: async (ctx, input): Promise<void> => {
      const parsed = parseCommandInput(input);
      await requireCommand(parsed.name).execute(ctx, parsed.args);
    },
    complete: async (ctx, input): Promise<string[]> => {
      const parsed = parseCommandInput(input);
      const command = commands.get(parsed.name);
      if (command?.complete !== undefined && input.includes(" ")) {
        return command.complete(ctx, parsed.args);
      }
      const prefix = normalizeName(parsed.name);
      return [...commands.values()]
        .filter((commandItem) => commandItem.hidden !== true)
        .map((commandItem) => `/${commandItem.name}`)
        .filter((name) => name.startsWith(`/${prefix}`));
    },
  };
}

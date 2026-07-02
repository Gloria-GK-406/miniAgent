import type { CLICommand } from "./types.js";

export function getCommandRegistrationNames(command: CLICommand): string[] {
  return [command.name, ...(command.aliases ?? [])]
    .map((name) => name.startsWith("/") ? name.slice(1) : name);
}

export function findCommandNamespaceConflict(
  command: CLICommand,
  registeredCommandNames: ReadonlySet<string>,
): string | undefined {
  const commandNames = new Set<string>();
  for (const name of getCommandRegistrationNames(command)) {
    if (registeredCommandNames.has(name) || commandNames.has(name)) {
      return name;
    }
    commandNames.add(name);
  }
  return undefined;
}

export function addCommandRegistrationNames(
  registeredCommandNames: Set<string>,
  command: CLICommand,
): void {
  for (const name of getCommandRegistrationNames(command)) {
    registeredCommandNames.add(name);
  }
}

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { CLIEntryAction } from "./entry-args.js";

export async function loadEntryPrompt(
  action: Extract<CLIEntryAction, { type: "tui" | "print" }>,
  cwd: string,
): Promise<string | undefined> {
  if (action.promptFile === undefined) {
    return action.prompt;
  }
  const path = isAbsolute(action.promptFile)
    ? action.promptFile
    : resolve(cwd, action.promptFile);
  return (await readFile(path, "utf-8")).trim();
}

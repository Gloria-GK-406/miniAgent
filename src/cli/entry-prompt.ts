import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { CLIEntryAction } from "./entry-args.js";
import { readStdin } from "./stdin.js";

export interface LoadEntryPromptOptions {
  readStdin?: () => Promise<string>;
}

export async function loadEntryPrompt(
  action: Extract<CLIEntryAction, { type: "tui" | "print" }>,
  cwd: string,
  options: LoadEntryPromptOptions = {},
): Promise<string | undefined> {
  if (action.promptFile === undefined) {
    return action.prompt;
  }
  if (action.promptFile === "-") {
    return (await (options.readStdin ?? readStdin)()).trim();
  }
  const path = isAbsolute(action.promptFile)
    ? action.promptFile
    : resolve(cwd, action.promptFile);
  return (await readFile(path, "utf-8")).trim();
}

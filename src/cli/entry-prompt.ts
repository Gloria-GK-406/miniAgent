import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import process from "node:process";
import type { CLIEntryAction } from "./entry-args.js";

export interface LoadEntryPromptOptions {
  readStdin?: () => Promise<string>;
}

function readProcessStdin(): Promise<string> {
  return new Promise((resolvePrompt, reject) => {
    let content = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      content += chunk;
    });
    process.stdin.once("end", () => resolvePrompt(content));
    process.stdin.once("error", reject);
    process.stdin.resume();
  });
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
    return (await (options.readStdin ?? readProcessStdin)()).trim();
  }
  const path = isAbsolute(action.promptFile)
    ? action.promptFile
    : resolve(cwd, action.promptFile);
  return (await readFile(path, "utf-8")).trim();
}

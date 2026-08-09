import { z } from "zod";
import { readdir, stat, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Tool } from "../core/index.js";
import { isCapabilityEnabled, type AgentCapabilitySelector } from "../core/index.js";

const GrepParamsSchema = z.object({
  pattern: z.string().describe("Regular expression pattern to search for"),
  path: z.string().describe("Directory or file to search in"),
  include: z.string().optional().describe("File glob to filter (e.g. *.ts)"),
});

function simpleGlobMatch(glob: string, name: string): boolean {
  const regexStr = "^" + glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".") + "$";
  return new RegExp(regexStr).test(name);
}

async function walkFiles(dir: string, baseDir: string, results: string[]): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) {
      await walkFiles(fullPath, baseDir, results);
    } else {
      results.push(fullPath);
    }
  }
}

async function grepExecute(args: Record<string, unknown>): Promise<string> {
  const parsed = GrepParamsSchema.parse(args);
  const regex = new RegExp(parsed.pattern, "g");

  let isDir: boolean;
  try {
    const s = await stat(parsed.path);
    isDir = s.isDirectory();
  } catch {
    return `Error: path not found: ${parsed.path}`;
  }

  let files: string[];
  if (isDir) {
    files = [];
    await walkFiles(parsed.path, parsed.path, files);
  } else {
    files = [parsed.path];
  }

  if (parsed.include) {
    files = files.filter((f) => {
      const name = f.split("/").pop() ?? "";
      return simpleGlobMatch(parsed.include!, name);
    });
  }

  const outputLines: string[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    const relPath = relative(parsed.path, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      regex.lastIndex = 0;
      if (regex.test(line)) {
        outputLines.push(`${relPath}:${i + 1}: ${line}`);
      }
    }
  }

  if (outputLines.length === 0) {
    return "No matches found.";
  }

  return outputLines.join("\n");
}

export class GrepTool implements Tool {
  name = "grep" as const;
  description = "Search file contents using regular expressions. Supports include glob to filter files.";
  parameters = GrepParamsSchema;
  execute = grepExecute;

  async consumeAgentCapabilities(capabilities: AgentCapabilitySelector): Promise<boolean> {
    return isCapabilityEnabled(this.name, capabilities.tool);
  }
}

export const grepTool: Tool & { consumeAgentCapabilities: (capabilities: AgentCapabilitySelector) => Promise<boolean> } = new GrepTool();

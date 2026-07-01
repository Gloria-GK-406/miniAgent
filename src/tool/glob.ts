import { z } from "zod";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Tool } from "./types.js";
import { isCapabilityEnabled } from "../assembly/capability.js";
import type { AgentCapabilitySelector } from "../assembly/capability.js";

const GlobParamsSchema = z.object({
  pattern: z.string().describe("Glob pattern to match (e.g. **/*.ts)"),
  path: z.string().describe("Base directory to search from"),
});

function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function matchGlob(pattern: string, filePath: string): boolean {
  const parts = pattern.split("/");
  const fileParts = filePath.split("/");

  return matchParts(parts, 0, fileParts, 0);
}

function matchParts(
  patternParts: string[], pi: number,
  fileParts: string[], fi: number,
): boolean {
  if (pi === patternParts.length && fi === fileParts.length) return true;
  if (pi === patternParts.length) return false;

  const part = patternParts[pi]!;

  if (part === "**") {
    const nextPi = pi + 1;
    if (nextPi === patternParts.length) return true;
    for (let i = fi; i <= fileParts.length; i++) {
      if (matchParts(patternParts, nextPi, fileParts, i)) return true;
    }
    return false;
  }

  if (fi === fileParts.length) return false;

  if (matchSegment(part, fileParts[fi]!)) {
    return matchParts(patternParts, pi + 1, fileParts, fi + 1);
  }

  return false;
}

function matchSegment(pattern: string, segment: string): boolean {
  const regexStr = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]") + "$";
  return new RegExp(regexStr).test(segment);
}

async function walkDir(dir: string, baseDir: string, results: string[]): Promise<void> {
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
      await walkDir(fullPath, baseDir, results);
    } else {
      results.push(toPosixPath(relative(baseDir, fullPath)));
    }
  }
}

async function globExecute(args: Record<string, unknown>): Promise<string> {
  const parsed = GlobParamsSchema.parse(args);

  const files: string[] = [];
  await walkDir(parsed.path, parsed.path, files);

  const matched = files.filter((f) => matchGlob(parsed.pattern, f));

  if (matched.length === 0) {
    return "No files matched the pattern.";
  }

  return matched.join("\n");
}

export class GlobTool implements Tool {
  name = "glob" as const;
  description = "Find files matching a glob pattern. Supports **, *, and ? wildcards.";
  parameters = GlobParamsSchema;
  execute = globExecute;

  async consumeAgentCapabilities(capabilities: AgentCapabilitySelector): Promise<boolean> {
    return isCapabilityEnabled(this.name, capabilities.tool);
  }
}

export const globTool: Tool & { consumeAgentCapabilities: (capabilities: AgentCapabilitySelector) => Promise<boolean> } = new GlobTool();

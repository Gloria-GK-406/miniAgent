import { z } from "zod";
import { readFile, readdir, stat } from "node:fs/promises";
import type { Tool } from "./types.js";

const ReadParamsSchema = z.object({
  path: z.string().describe("Absolute path to the file or directory"),
  offset: z.number().int().min(1).optional().describe("Line number to start reading from (1-indexed)"),
  limit: z.number().int().min(1).optional().describe("Maximum number of lines to read"),
});

async function readExecute(args: Record<string, unknown>): Promise<string> {
  const parsed = ReadParamsSchema.parse(args);
  const filePath = parsed.path;

  let isDir: boolean;
  try {
    const s = await stat(filePath);
    isDir = s.isDirectory();
  } catch {
    return `Error: path not found: ${filePath}`;
  }

  if (isDir) {
    const entries = await readdir(filePath);
    return entries.join("\n");
  }

  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");

  if (parsed.offset !== undefined || parsed.limit !== undefined) {
    const start = (parsed.offset ?? 1) - 1;
    const end = parsed.limit !== undefined ? start + parsed.limit : lines.length;
    return lines.slice(start, end).join("\n");
  }

  return content;
}

export const readTool: Tool = {
  name: "read",
  description: "Read a file or directory. For files, returns content with optional line range. For directories, returns entry names.",
  parameters: ReadParamsSchema,
  execute: readExecute,
};

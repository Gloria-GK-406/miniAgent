import { z } from "zod";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Tool } from "./types.js";

const WriteParamsSchema = z.object({
  path: z.string().describe("Absolute path to write the file"),
  content: z.string().describe("Content to write to the file"),
});

async function writeExecute(args: Record<string, unknown>): Promise<string> {
  const parsed = WriteParamsSchema.parse(args);

  await mkdir(dirname(parsed.path), { recursive: true });
  await writeFile(parsed.path, parsed.content, "utf-8");

  return `Successfully wrote to ${parsed.path}`;
}

export const writeTool: Tool = {
  name: "write",
  description: "Write content to a file. Creates parent directories if needed. Overwrites existing files.",
  parameters: WriteParamsSchema,
  execute: writeExecute,
};

import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import type { Tool } from "./types.js";
import { isCapabilityEnabled } from "../assembly/capability.js";
import type { AgentCapabilitySelector } from "../assembly/capability.js";

const EditParamsSchema = z.object({
  path: z.string().describe("Absolute path to the file to edit"),
  oldString: z.string().describe("Exact text to find and replace"),
  newString: z.string().describe("Text to replace with"),
  replaceAll: z.boolean().optional().describe("Replace all occurrences instead of just the first"),
});

async function editExecute(args: Record<string, unknown>): Promise<string> {
  const parsed = EditParamsSchema.parse(args);

  let content: string;
  try {
    content = await readFile(parsed.path, "utf-8");
  } catch {
    return `Error: file not found: ${parsed.path}`;
  }

  if (!content.includes(parsed.oldString)) {
    return `Error: oldString not found in ${parsed.path}`;
  }

  if (!parsed.replaceAll) {
    const count = content.split(parsed.oldString).length - 1;
    if (count > 1) {
      return `Error: oldString found ${count} times in ${parsed.path}. Use replaceAll: true or provide more context to make it unique.`;
    }
  }

  const newContent = parsed.replaceAll
    ? content.replaceAll(parsed.oldString, parsed.newString)
    : content.replace(parsed.oldString, parsed.newString);

  await writeFile(parsed.path, newContent, "utf-8");

  return `Successfully edited ${parsed.path}`;
}

export class EditTool implements Tool {
  name = "edit" as const;
  description = "Perform exact string replacement in a file. Fails if oldString is not found or found multiple times (unless replaceAll is true).";
  parameters = EditParamsSchema;
  execute = editExecute;

  async consumeAgentCapabilities(capabilities: AgentCapabilitySelector): Promise<boolean> {
    return isCapabilityEnabled(this.name, capabilities.tool);
  }
}

export const editTool: Tool & { consumeAgentCapabilities: (capabilities: AgentCapabilitySelector) => Promise<boolean> } = new EditTool();

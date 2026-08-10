import { z } from "zod";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Tool } from "../core/index.js";
import { isCapabilityEnabled, type AgentCapabilitySelector } from "../core/index.js";

const WriteParamsSchema = z.object({
  path: z.string().meta({ description: "Absolute path to write the file" }),
  content: z.string().meta({ description: "Content to write to the file" }),
});

async function writeExecute(args: Record<string, unknown>): Promise<string> {
  const parsed = WriteParamsSchema.parse(args);

  await mkdir(dirname(parsed.path), { recursive: true });
  await writeFile(parsed.path, parsed.content, "utf-8");

  return `Successfully wrote to ${parsed.path}`;
}

export class WriteTool implements Tool {
  name = "write" as const;
  description = "Write content to a file. Creates parent directories if needed. Overwrites existing files.";
  parameters = WriteParamsSchema;
  execute = writeExecute;

  async consumeAgentCapabilities(capabilities: AgentCapabilitySelector): Promise<boolean> {
    return isCapabilityEnabled(this.name, capabilities.tool);
  }
}

export const writeTool: Tool & { consumeAgentCapabilities: (capabilities: AgentCapabilitySelector) => Promise<boolean> } = new WriteTool();

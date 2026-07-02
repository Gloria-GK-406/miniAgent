import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "../tool/types.js";
import type { PrintStreams } from "./print-runner.js";
import type { CLIAppRuntime } from "./runtime/types.js";

export type ToolListOutput = "text" | "json";

export interface ToolListItem {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toToolListItem(tool: Tool): ToolListItem {
  const { $schema: _, ...parameters } = zodToJsonSchema(tool.parameters) as Record<string, unknown>;
  return {
    name: tool.name,
    description: tool.description,
    parameters,
  };
}

export function formatToolList(tools: ToolListItem[]): string {
  if (tools.length === 0) {
    return "No tools available\n";
  }
  return `${tools.map((tool) => `${tool.name} - ${tool.description}`).join("\n")}\n`;
}

export function formatToolListJson(tools: ToolListItem[]): string {
  return `${JSON.stringify({ tools }, null, 2)}\n`;
}

export async function runToolList(
  runtime: CLIAppRuntime,
  streams: PrintStreams,
  options: { output?: ToolListOutput } = {},
): Promise<number> {
  try {
    const tools = (await runtime.listTools())
      .map(toToolListItem)
      .sort((left, right) => left.name.localeCompare(right.name));
    streams.stdout(
      options.output === "json"
        ? formatToolListJson(tools)
        : formatToolList(tools),
    );
    return 0;
  } catch (error: unknown) {
    streams.stderr(`${errorMessage(error)}\n`);
    return 1;
  } finally {
    await runtime.destroy();
  }
}

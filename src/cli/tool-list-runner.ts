import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool } from "../tool/types.js";
import type { PrintStreams } from "./print-runner.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import { createModeAwarePermissionService, createPermissionService } from "./runtime/permission-service.js";
import type { CLIAppRuntime, CLIPermissionResult } from "./runtime/types.js";

export type ToolListOutput = "text" | "json";

export interface ToolListItem {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  permission?: CLIPermissionResult;
}

export function toToolListItem(
  tool: Tool,
  permission?: CLIPermissionResult,
): ToolListItem {
  const { $schema: _, ...parameters } = zodToJsonSchema(tool.parameters) as Record<string, unknown>;
  return {
    name: tool.name,
    description: tool.description,
    parameters,
    ...(permission !== undefined && { permission }),
  };
}

function formatToolListItem(tool: ToolListItem): string {
  const permission = tool.permission === undefined
    ? ""
    : `${tool.permission.decision.toUpperCase()} `;
  const reason = tool.permission === undefined ? "" : ` (${tool.permission.reason})`;
  return `${permission}${tool.name} - ${tool.description}${reason}`;
}

export function formatToolList(tools: ToolListItem[]): string {
  if (tools.length === 0) {
    return "No tools available\n";
  }
  return `${tools.map(formatToolListItem).join("\n")}\n`;
}

export function formatToolListJson(tools: ToolListItem[]): string {
  return `${JSON.stringify({ tools }, null, 2)}\n`;
}

export async function runToolList(
  runtime: CLIAppRuntime,
  streams: PrintStreams,
  options: { output?: ToolListOutput } = {},
): Promise<number> {
  const output = options.output ?? "text";
  try {
    const state = runtime.getState();
    const permissionService = createModeAwarePermissionService({
      base: createPermissionService(state.config.permission),
      getMode: () => state.mode,
    });
    const tools = (await runtime.listTools())
      .map((tool) => toToolListItem(
        tool,
        permissionService.resolve({ toolName: tool.name, args: {} }, state.autoApprove),
      ))
      .sort((left, right) => left.name.localeCompare(right.name));
    streams.stdout(
      output === "json"
        ? formatToolListJson(tools)
        : formatToolList(tools),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  } finally {
    await runtime.destroy();
  }
}

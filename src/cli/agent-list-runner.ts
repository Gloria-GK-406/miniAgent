import { z } from "zod";
import type { PrintStreams } from "./print-runner.js";
import {
  CLIViewPanelSchema,
  type CLIAppRuntime,
  type CLIViewPanel,
} from "./runtime/types.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";

export const AgentListOutputSchema = z.enum(["text", "json"]);
export type AgentListOutput = z.infer<typeof AgentListOutputSchema>;
export const AgentListPanelSchema = CLIViewPanelSchema.refine(
  (panel) => panel.type === "agents",
) as z.ZodType<Extract<CLIViewPanel, { type: "agents" }>>;
export type AgentListPanel = z.infer<typeof AgentListPanelSchema>;

function formatSubagent(subagent: AgentListPanel["subagents"][number]): string {
  const name = subagent.name !== subagent.id ? ` (${subagent.name})` : "";
  const description = subagent.description.trim().length > 0 ? ` - ${subagent.description}` : "";
  const model = subagent.model !== undefined ? ` [${subagent.model}]` : "";
  return `- ${subagent.id}${name}${description}${model}`;
}

export function formatAgentList(panel: AgentListPanel): string {
  if (panel.subagents.length === 0) {
    return `Primary agent: ${panel.mode}\nSubagents: none\n`;
  }
  return [
    `Primary agent: ${panel.mode}`,
    "Subagents:",
    ...panel.subagents.map(formatSubagent),
    "",
  ].join("\n");
}

export function formatAgentListJson(panel: AgentListPanel): string {
  return `${JSON.stringify({
    ok: true,
    mode: panel.mode,
    subagents: panel.subagents,
  }, null, 2)}\n`;
}

export async function runAgentList(
  runtime: CLIAppRuntime,
  streams: PrintStreams,
  options: { output?: AgentListOutput } = {},
): Promise<number> {
  const output = options.output ?? "text";
  try {
    await runtime.showAgents();
    const panel = runtime.getState().panel;
    if (panel.type !== "agents") {
      writeHeadlessError(streams, "Agent list did not produce results", output);
      return 1;
    }
    streams.stdout(
      output === "json"
        ? formatAgentListJson(panel)
        : formatAgentList(panel),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  } finally {
    await runtime.destroy();
  }
}

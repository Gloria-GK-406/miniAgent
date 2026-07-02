import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";
import type { CLIAppRuntime, CLIOverviewInfo, CLIState } from "./runtime/types.js";

export type OverviewOutput = "text" | "json";

function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

function formatTokenUsage(tokenUsage: CLIState["tokenUsage"]): string {
  return `${formatTokenCount(tokenUsage.input)} in / ${formatTokenCount(tokenUsage.output)} out / ${formatTokenCount(tokenUsage.total)} total`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatGitLine(info: CLIOverviewInfo): string {
  return info.git.repository
    ? `Git: ${info.git.branch ?? "(detached)"} - ${info.git.summary}`
    : `Git: ${info.git.summary}`;
}

export function formatOverview(info: CLIOverviewInfo): string {
  return [
    "Overview",
    `Workspace: ${info.workspace}`,
    `Session: ${info.sessionName} (${info.sessionId}) - ${plural(info.sessionCount, "session")}`,
    `Agent: ${info.mode}`,
    `Model: ${info.modelName}`,
    `Transcript: ${plural(info.messageCount, "message")}`,
    `Tokens: ${formatTokenUsage(info.tokenUsage)}`,
    `Todos: ${info.todoCounts.pending} pending / ${info.todoCounts.inProgress} active / ${info.todoCounts.completed} done`,
    `Activity: ${info.activityCounts.running} running / ${info.activityCounts.done} done / ${info.activityCounts.error} errors`,
    formatGitLine(info),
    `Permissions: ${info.defaultPermission} default, auto ${info.autoApprove ? "on" : "off"}`,
    `Reasoning: ${info.showReasoning ? "on" : "off"}`,
    `Tool details: ${info.showToolDetails ? "on" : "off"}`,
    "",
  ].join("\n");
}

export function formatOverviewJson(info: CLIOverviewInfo): string {
  return `${JSON.stringify({ ok: true, info }, null, 2)}\n`;
}

export async function runOverview(
  runtime: CLIAppRuntime,
  streams: PrintStreams,
  options: { output?: OverviewOutput } = {},
): Promise<number> {
  const output = options.output ?? "text";
  try {
    await runtime.showOverview();
    const panel = runtime.getState().panel;
    if (panel.type !== "overview") {
      writeHeadlessError(streams, "Overview did not produce results", output);
      return 1;
    }
    streams.stdout(
      output === "json"
        ? formatOverviewJson(panel.info)
        : formatOverview(panel.info),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  } finally {
    await runtime.destroy();
  }
}

import type { CLIPermissionDecision } from "./config.js";
import type { PrintStreams } from "./print-runner.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { CLIAppRuntime, CLIState } from "./runtime/types.js";

export type RuntimeStatusOutput = "text" | "json";

export interface RuntimeStatus {
  ok: boolean;
  baseDir: string;
  sessionId: string;
  sessionName: string;
  mode: CLIState["mode"];
  modelName: string;
  messageCount: number;
  tokenUsage: CLIState["tokenUsage"];
  autoApprove: boolean;
  showReasoning: boolean;
  showToolDetails: boolean;
  defaultPermission: CLIPermissionDecision;
  isRunning: boolean;
  currentTool: string | null;
}

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

function defaultPermission(state: CLIState): CLIPermissionDecision {
  const fallback = state.config.permission["*"];
  return fallback === "allow" || fallback === "ask" || fallback === "deny"
    ? fallback
    : "ask";
}

export function toRuntimeStatus(state: CLIState): RuntimeStatus {
  return {
    ok: true,
    baseDir: state.baseDir,
    sessionId: state.sessionId,
    sessionName: state.sessionName,
    mode: state.mode,
    modelName: state.modelName,
    messageCount: state.messages.length,
    tokenUsage: state.tokenUsage,
    autoApprove: state.autoApprove,
    showReasoning: state.showReasoning,
    showToolDetails: state.showToolDetails,
    defaultPermission: defaultPermission(state),
    isRunning: state.isRunning,
    currentTool: state.currentTool,
  };
}

export function formatRuntimeStatus(status: RuntimeStatus): string {
  return [
    `Workspace: ${status.baseDir}`,
    `Session: ${status.sessionName} (${status.sessionId})`,
    `Agent: ${status.mode}`,
    `Model: ${status.modelName}`,
    `Transcript: ${plural(status.messageCount, "message")}`,
    `Tokens: ${formatTokenUsage(status.tokenUsage)}`,
    `Auto approval: ${status.autoApprove ? "on" : "off"}`,
    `Reasoning: ${status.showReasoning ? "on" : "off"}`,
    `Tool details: ${status.showToolDetails ? "on" : "off"}`,
    `Default permission: ${status.defaultPermission}`,
    `Running: ${status.isRunning ? status.currentTool ?? "yes" : "no"}`,
    "",
  ].join("\n");
}

export function formatRuntimeStatusJson(status: RuntimeStatus): string {
  return `${JSON.stringify(status, null, 2)}\n`;
}

export async function runRuntimeStatus(
  runtime: CLIAppRuntime,
  streams: PrintStreams,
  options: { output?: RuntimeStatusOutput } = {},
): Promise<number> {
  const output = options.output ?? "text";
  try {
    const status = toRuntimeStatus(runtime.getState());
    streams.stdout(
      output === "json"
        ? formatRuntimeStatusJson(status)
        : formatRuntimeStatus(status),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  } finally {
    await runtime.destroy();
  }
}

import type { ToolCallMessage, ToolResultMessage, MessageContent } from "../../core/types.js";
import type { CLIActivityEntry, CLIApprovalAnswer, CLIApprovalDecision } from "./types.js";

export function classifyActivityKind(toolName: string): CLIActivityEntry["kind"] {
  return toolName.toLowerCase().includes("subagent") ? "subagent" : "tool";
}

function contentToText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (content.type === "text") return content.text;
  return "[image]";
}

function compactText(text: string, fallback: string): string {
  const firstLine = text.trim().split(/\r?\n/)[0];
  if (firstLine === undefined || firstLine.length === 0) return fallback;
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

function summarizeArguments(args: Record<string, unknown>): string {
  try {
    return compactText(JSON.stringify(args), "(no arguments)");
  } catch {
    return "(unserializable arguments)";
  }
}

function resultStatus(summary: string): CLIActivityEntry["status"] {
  const normalized = summary.toLowerCase();
  if (
    normalized.startsWith("error") ||
    normalized.startsWith("failed") ||
    normalized.startsWith("tool not found") ||
    normalized.includes("[exit code:") ||
    normalized.includes("[timed out]") ||
    normalized.includes("[aborted]")
  ) {
    return "error";
  }
  return "done";
}

export function createActivityEntry(
  toolCall: ToolCallMessage,
  startedAt: string,
): CLIActivityEntry {
  return {
    id: toolCall.toolCallId,
    kind: classifyActivityKind(toolCall.toolName),
    name: toolCall.toolName,
    status: "running",
    startedAt,
    summary: summarizeArguments(toolCall.arguments),
  };
}

export function createApprovalActivityEntry(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
  startedAt: string,
): CLIActivityEntry {
  return {
    id,
    kind: "approval",
    name: toolName,
    status: "running",
    startedAt,
    summary: summarizeArguments(args),
  };
}

function normalizeApprovalDecision(decision: CLIApprovalAnswer): CLIApprovalDecision {
  if (decision === true) return "allow";
  if (decision === false) return "deny";
  return decision;
}

function approvalDecisionStatus(decision: CLIApprovalDecision): CLIActivityEntry["status"] {
  return decision === "allow" || decision === "allow-session" ? "done" : "error";
}

function approvalDecisionSummary(decision: CLIApprovalDecision, toolName: string): string {
  if (decision === "allow-session") return `approved ${toolName} for session`;
  if (decision === "deny-session") return `rejected ${toolName} for session`;
  return `${decision === "allow" ? "approved" : "rejected"} ${toolName}`;
}

export function completeApprovalActivityEntry(
  entries: CLIActivityEntry[],
  id: string,
  answer: CLIApprovalAnswer,
  endedAt: string,
): CLIActivityEntry[] {
  const decision = normalizeApprovalDecision(answer);
  return entries.map((entry) => {
    if (entry.id !== id) return entry;
    return {
      ...entry,
      status: approvalDecisionStatus(decision),
      endedAt,
      summary: approvalDecisionSummary(decision, entry.name),
    };
  });
}

export function completeActivityEntry(
  entries: CLIActivityEntry[],
  toolCall: ToolCallMessage,
  result: ToolResultMessage,
  endedAt: string,
): CLIActivityEntry[] {
  const resultText = contentToText(result.content);
  const summary = compactText(resultText, "(no output)");
  const status = resultStatus(resultText);
  let found = false;
  const nextEntries = entries.map((entry) => {
    if (entry.id !== toolCall.toolCallId) return entry;
    found = true;
    return {
      ...entry,
      status,
      endedAt,
      summary,
    };
  });

  if (found) return nextEntries;
  return [
    ...nextEntries,
    {
      ...createActivityEntry(toolCall, endedAt),
      status,
      endedAt,
      summary,
    },
  ];
}

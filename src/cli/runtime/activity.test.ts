import { describe, expect, it } from "vitest";
import { MessageType } from "../../core/types.js";
import {
  classifyActivityKind,
  completeActivityEntry,
  createActivityEntry,
} from "./activity.js";
import type { ToolCallMessage, ToolResultMessage } from "../../core/types.js";

function toolCall(toolName: string): ToolCallMessage {
  return {
    id: "msg-1",
    type: MessageType.ToolCall,
    content: "",
    toolCallId: "call-1",
    toolName,
    arguments: { path: "src/index.ts" },
  };
}

function toolResult(content: string): ToolResultMessage {
  return {
    id: "msg-2",
    type: MessageType.ToolResult,
    content,
    toolCallId: "call-1",
  };
}

describe("activity helpers", () => {
  it("classifies subagent-shaped tool names", () => {
    expect(classifyActivityKind("run_subagent")).toBe("subagent");
    expect(classifyActivityKind("subagent")).toBe("subagent");
    expect(classifyActivityKind("read")).toBe("tool");
  });

  it("creates running activity entries from tool calls", () => {
    expect(createActivityEntry(toolCall("read"), "2026-07-02T00:00:00.000Z")).toEqual({
      id: "call-1",
      kind: "tool",
      name: "read",
      status: "running",
      startedAt: "2026-07-02T00:00:00.000Z",
      summary: '{"path":"src/index.ts"}',
    });
  });

  it("completes activity entries with result summaries", () => {
    const running = createActivityEntry(toolCall("run_subagent"), "2026-07-02T00:00:00.000Z");

    expect(completeActivityEntry(
      [running],
      toolCall("run_subagent"),
      toolResult("subtask complete\nmore details"),
      "2026-07-02T00:00:01.000Z",
    )).toEqual([
      {
        ...running,
        status: "done",
        endedAt: "2026-07-02T00:00:01.000Z",
        summary: "subtask complete",
      },
    ]);
  });

  it("marks error-like results as failed", () => {
    const running = createActivityEntry(toolCall("read"), "2026-07-02T00:00:00.000Z");
    const [completed] = completeActivityEntry(
      [running],
      toolCall("read"),
      toolResult("Error: file missing"),
      "2026-07-02T00:00:01.000Z",
    );

    expect(completed?.status).toBe("error");
  });

  it("marks shell shortcut status suffixes as failed", () => {
    const running = createActivityEntry(toolCall("shell"), "2026-07-02T00:00:00.000Z");

    const [exitCode] = completeActivityEntry(
      [running],
      toolCall("shell"),
      toolResult("[No output]\n[Exit code: 7]"),
      "2026-07-02T00:00:01.000Z",
    );
    const [timedOut] = completeActivityEntry(
      [running],
      toolCall("shell"),
      toolResult("[No output]\n[Timed out]"),
      "2026-07-02T00:00:01.000Z",
    );
    const [aborted] = completeActivityEntry(
      [running],
      toolCall("shell"),
      toolResult("[No output]\n[Aborted]"),
      "2026-07-02T00:00:01.000Z",
    );

    expect(exitCode?.status).toBe("error");
    expect(timedOut?.status).toBe("error");
    expect(aborted?.status).toBe("error");
  });
});

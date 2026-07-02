import { describe, expect, it, vi } from "vitest";
import { renderToString } from "ink";
import { ActivityView, getActivityWindow } from "./ActivityView.js";
import type { CLIActivityEntry } from "../runtime/types.js";

function entry(overrides: Partial<CLIActivityEntry>): CLIActivityEntry {
  return {
    id: overrides.id ?? "a1",
    kind: overrides.kind ?? "tool",
    name: overrides.name ?? "read",
    status: overrides.status ?? "running",
    startedAt: overrides.startedAt ?? "2026-07-02T00:00:00.000Z",
    summary: overrides.summary ?? "reading",
    ...(overrides.endedAt !== undefined && { endedAt: overrides.endedAt }),
  };
}

describe("getActivityWindow", () => {
  it("clamps windows to available entries", () => {
    const entries = [entry({ id: "a" }), entry({ id: "b" }), entry({ id: "c" })];
    const window = getActivityWindow(entries, 2, 8);

    expect(window.visibleEntries.map((item) => item.id)).toEqual(["b", "c"]);
    expect(window.maxOffset).toBe(1);
    expect(window.scrollOffset).toBe(1);
  });
});

describe("ActivityView", () => {
  it("renders tool and subagent activity entries", () => {
    const output = renderToString(
      <ActivityView
        entries={[
          entry({ id: "a", kind: "tool", name: "read", status: "running", summary: "src/index.ts" }),
          entry({
            id: "b",
            kind: "subagent",
            name: "run_subagent",
            status: "done",
            summary: "subtask complete",
            endedAt: "2026-07-02T00:00:03.000Z",
          }),
        ]}
        onClose={vi.fn()}
      />,
    );

    expect(output).toContain("Activity (2)");
    expect(output).toContain("RUNNING TOOL read");
    expect(output).toContain("DONE AGENT run_subagent");
    expect(output).toContain("subtask complete");
  });

  it("renders an empty state", () => {
    const output = renderToString(
      <ActivityView entries={[]} onClose={vi.fn()} />,
    );

    expect(output).toContain("Activity (0)");
    expect(output).toContain("No activity yet");
  });
});

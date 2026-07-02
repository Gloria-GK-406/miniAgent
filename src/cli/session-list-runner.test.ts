import { describe, expect, it } from "vitest";
import type { SessionMeta } from "../core/session.js";
import { formatSessionList } from "./session-list-runner.js";

function session(overrides: Partial<SessionMeta>): SessionMeta {
  return {
    id: "s1",
    name: "default",
    createdAt: "2026-07-02T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:01.000Z",
    messageCount: 0,
    ...overrides,
  };
}

describe("formatSessionList", () => {
  it("formats sessions with the active session marked", () => {
    expect(formatSessionList([
      session({ id: "s1", name: "default", messageCount: 1 }),
      session({ id: "s2", name: "feature", messageCount: 3 }),
    ], "s2")).toBe([
      "  s1 default (1 message, updated 2026-07-02T00:00:01.000Z)",
      "* s2 feature (3 messages, updated 2026-07-02T00:00:01.000Z)",
      "",
    ].join("\n"));
  });

  it("formats an empty session list", () => {
    expect(formatSessionList([], undefined)).toBe("No sessions\n");
  });
});

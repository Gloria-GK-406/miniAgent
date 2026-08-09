import type { SessionMeta } from "./session-manager.js";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function formatSessionList(
  sessions: SessionMeta[],
  activeSessionId: string | undefined,
): string {
  if (sessions.length === 0) {
    return "No sessions\n";
  }
  return `${sessions.map((session) => {
    const marker = session.id === activeSessionId ? "*" : " ";
    return [
      marker,
      session.id,
      session.name,
      `(${plural(session.messageCount, "message")}, updated ${session.updatedAt})`,
    ].join(" ");
  }).join("\n")}\n`;
}

export function formatSessionListJson(
  sessions: SessionMeta[],
  activeSessionId: string | undefined,
): string {
  return `${JSON.stringify({
    activeSessionId: activeSessionId ?? null,
    sessions,
  }, null, 2)}\n`;
}

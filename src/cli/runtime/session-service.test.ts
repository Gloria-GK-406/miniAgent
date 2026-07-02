import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MessageType } from "../../core/types.js";
import type { Message } from "../../core/types.js";
import { createCLISessionService } from "./session-service.js";

describe("CLISessionService", () => {
  it("creates, switches, renames, forks, and deletes sessions with a last-session guard", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-session-service-"));
    const service = await createCLISessionService(baseDir);

    const first = await service.ensureActiveSession();
    const second = await service.createSession("feature");
    await service.switchSession(second.id);
    await service.renameSession(second.id, "renamed");
    const fork = await service.forkSession(second.id, "forked");

    expect(service.getActiveSession().id).toBe(second.id);
    expect(service.listSessions().map((session) => session.name)).toEqual([
      "forked",
      "renamed",
      "default",
    ]);
    expect(fork.name).toBe("forked");

    await service.deleteSession(first.id);
    await service.deleteSession(fork.id);
    await expect(service.deleteSession(second.id)).rejects.toThrow(
      "Cannot delete the last session",
    );
  });

  it("reads and rewrites session messages", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-session-messages-"));
    const service = await createCLISessionService(baseDir);
    const session = await service.ensureActiveSession();
    const messages: Message[] = [
      {
        id: "u1",
        type: MessageType.User,
        content: "hello",
      },
      {
        id: "a1",
        type: MessageType.Assist,
        content: "world",
      },
    ];

    await service.writeMessages(session.id, messages);

    expect(await service.readMessages(session.id)).toEqual(messages);
    expect(service.getSession(session.id).messageCount).toBe(2);
  });

  it("forks session data files", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-session-fork-"));
    const service = await createCLISessionService(baseDir);
    const session = await service.ensureActiveSession();
    const persistDir = service.getSessionPersistDir(session.id);
    await writeFile(join(persistDir, "notes.txt"), "copied", "utf-8");

    const fork = await service.forkSession(session.id, "copied-session");

    await expect(
      readFile(join(service.getSessionPersistDir(fork.id), "notes.txt"), "utf-8"),
    ).resolves.toBe("copied");
  });
});

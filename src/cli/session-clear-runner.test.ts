import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MessageType, type Message } from "../core/index.js";
import { createCLISessionService } from "./runtime/session-service.js";
import {
  formatSessionClearResultJson,
  runSessionClear,
} from "./session-clear-runner.js";

async function setupSession(): Promise<{ baseDir: string; sessionId: string }> {
  const baseDir = await mkdtemp(join(tmpdir(), "miniagent-headless-clear-"));
  const service = await createCLISessionService(baseDir);
  const session = await service.ensureActiveSession();
  const messages: Message[] = [
    { id: "u1", type: MessageType.User, content: "old context" },
    { id: "a1", type: MessageType.Assist, content: "old answer" },
  ];
  await service.writeMessages(session.id, messages);
  await service.updateSessionTokenUsage(session.id, { input: 10, output: 20, total: 30 });
  return { baseDir, sessionId: session.id };
}

describe("formatSessionClearResultJson", () => {
  it("formats clear results as json", () => {
    expect(formatSessionClearResultJson({
      ok: true,
      sessionId: "s1",
      sessionName: "default",
      messageCount: 0,
    })).toBe([
      "{",
      "  \"ok\": true,",
      "  \"sessionId\": \"s1\",",
      "  \"sessionName\": \"default\",",
      "  \"messageCount\": 0",
      "}\n",
    ].join("\n"));
  });
});

describe("runSessionClear", () => {
  it("clears the active session and prints confirmation", async () => {
    const { baseDir, sessionId } = await setupSession();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionClear({ baseDir }, { stdout, stderr })).resolves.toBe(0);

    const service = await createCLISessionService(baseDir);
    await expect(service.readMessages(sessionId)).resolves.toEqual([]);
    await expect(service.readSessionRuntimeMetadata(sessionId)).resolves.toMatchObject({
      tokenUsage: { input: 0, output: 0, total: 0 },
    });
    expect(service.getSession(sessionId).messageCount).toBe(0);
    expect(stdout).toHaveBeenCalledWith(`Cleared session ${sessionId}\n`);
    expect(stderr).not.toHaveBeenCalled();
  });

  it("clears a requested session and prints json when requested", async () => {
    const { baseDir, sessionId } = await setupSession();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionClear({
      baseDir,
      sessionId,
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatSessionClearResultJson({
      ok: true,
      sessionId,
      sessionName: "default",
      messageCount: 0,
    }));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints clear errors as json when requested", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-headless-clear-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionClear({
      baseDir,
      sessionId: "missing",
      output: "json",
    }, { stdout, stderr })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"Session not found: missing\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
  });
});

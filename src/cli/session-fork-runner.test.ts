import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MessageType, type Message } from "../core/types.js";
import { createCLISessionService } from "./runtime/session-service.js";
import {
  formatSessionForkResultJson,
  runSessionFork,
} from "./session-fork-runner.js";

async function setupSession(): Promise<{ baseDir: string; sessionId: string }> {
  const baseDir = await mkdtemp(join(tmpdir(), "miniagent-headless-fork-"));
  const service = await createCLISessionService(baseDir);
  const session = await service.ensureActiveSession();
  const messages: Message[] = [
    { id: "u1", type: MessageType.User, content: "hello" },
  ];
  await service.writeMessages(session.id, messages);
  return { baseDir, sessionId: session.id };
}

describe("formatSessionForkResultJson", () => {
  it("formats fork results as json", () => {
    expect(formatSessionForkResultJson({
      ok: true,
      sessionId: "s2",
      sessionName: "Forked",
      sourceSessionId: "s1",
      messageCount: 1,
    })).toBe([
      "{",
      "  \"ok\": true,",
      "  \"sessionId\": \"s2\",",
      "  \"sessionName\": \"Forked\",",
      "  \"sourceSessionId\": \"s1\",",
      "  \"messageCount\": 1",
      "}\n",
    ].join("\n"));
  });
});

describe("runSessionFork", () => {
  it("forks a requested session and prints the new session id", async () => {
    const { baseDir, sessionId } = await setupSession();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionFork({
      baseDir,
      sessionId,
      name: "Forked",
    }, { stdout, stderr })).resolves.toBe(0);

    const forkId = (stdout.mock.calls[0]?.[0] as string).trim();
    const service = await createCLISessionService(baseDir);
    expect(forkId).not.toBe(sessionId);
    expect(service.getSession(forkId).name).toBe("Forked");
    await expect(readFile(join(baseDir, ".cliagent", "sessions", forkId, "data", "messages.jsonl"), "utf-8"))
      .resolves.toContain("hello");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints json when requested", async () => {
    const { baseDir, sessionId } = await setupSession();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionFork({
      baseDir,
      sessionId,
      name: "Forked",
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"ok": true'));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"sessionName": "Forked"'));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining(`"sourceSessionId": "${sessionId}"`));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints fork errors as json when requested", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-headless-fork-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionFork({
      baseDir,
      sessionId: "missing",
      output: "json",
    }, { stdout, stderr })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"Session not found: missing\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
  });
});

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCLISessionService } from "./runtime/session-service.js";
import {
  formatSessionDeleteResultJson,
  runSessionDelete,
} from "./session-delete-runner.js";

async function setupSessions(): Promise<{ baseDir: string; sessionId: string }> {
  const baseDir = await mkdtemp(join(tmpdir(), "miniagent-headless-delete-"));
  const service = await createCLISessionService(baseDir);
  await service.ensureActiveSession();
  const session = await service.createSession("scratch");
  return { baseDir, sessionId: session.id };
}

describe("formatSessionDeleteResultJson", () => {
  it("formats delete results as json", () => {
    expect(formatSessionDeleteResultJson({
      ok: true,
      sessionId: "s1",
    })).toBe([
      "{",
      "  \"ok\": true,",
      "  \"sessionId\": \"s1\"",
      "}\n",
    ].join("\n"));
  });
});

describe("runSessionDelete", () => {
  it("deletes a requested session and prints confirmation", async () => {
    const { baseDir, sessionId } = await setupSessions();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionDelete({
      baseDir,
      sessionId,
    }, { stdout, stderr })).resolves.toBe(0);

    const service = await createCLISessionService(baseDir);
    expect(() => service.getSession(sessionId)).toThrow(`Session not found: ${sessionId}`);
    expect(stdout).toHaveBeenCalledWith(`Deleted session ${sessionId}\n`);
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints json when requested", async () => {
    const { baseDir, sessionId } = await setupSessions();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionDelete({
      baseDir,
      sessionId,
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatSessionDeleteResultJson({
      ok: true,
      sessionId,
    }));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints delete errors as json when requested", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-headless-delete-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionDelete({
      baseDir,
      sessionId: "missing",
      output: "json",
    }, { stdout, stderr })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"Session not found: missing\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
  });
});

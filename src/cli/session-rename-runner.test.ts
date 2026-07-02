import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCLISessionService } from "./runtime/session-service.js";
import {
  formatSessionRenameResultJson,
  runSessionRename,
} from "./session-rename-runner.js";

async function setupSession(): Promise<{ baseDir: string; sessionId: string }> {
  const baseDir = await mkdtemp(join(tmpdir(), "miniagent-headless-rename-"));
  const service = await createCLISessionService(baseDir);
  const session = await service.ensureActiveSession();
  return { baseDir, sessionId: session.id };
}

describe("formatSessionRenameResultJson", () => {
  it("formats rename results as json", () => {
    expect(formatSessionRenameResultJson({
      ok: true,
      sessionId: "s1",
      sessionName: "Feature",
    })).toBe([
      "{",
      "  \"ok\": true,",
      "  \"sessionId\": \"s1\",",
      "  \"sessionName\": \"Feature\"",
      "}\n",
    ].join("\n"));
  });
});

describe("runSessionRename", () => {
  it("renames a requested session and prints confirmation", async () => {
    const { baseDir, sessionId } = await setupSession();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionRename({
      baseDir,
      sessionId,
      name: "Feature",
    }, { stdout, stderr })).resolves.toBe(0);

    const service = await createCLISessionService(baseDir);
    expect(service.getSession(sessionId).name).toBe("Feature");
    expect(stdout).toHaveBeenCalledWith(`Renamed session ${sessionId}\n`);
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints json when requested", async () => {
    const { baseDir, sessionId } = await setupSession();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionRename({
      baseDir,
      sessionId,
      name: "Feature",
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatSessionRenameResultJson({
      ok: true,
      sessionId,
      sessionName: "Feature",
    }));
    expect(stderr).not.toHaveBeenCalled();
  });
});

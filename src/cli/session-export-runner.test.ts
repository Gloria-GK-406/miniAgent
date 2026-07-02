import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MessageType, type Message } from "../core/types.js";
import { createCLISessionService } from "./runtime/session-service.js";
import {
  formatSessionExportResultJson,
  runSessionExport,
} from "./session-export-runner.js";

async function setupSession(): Promise<{ baseDir: string; sessionId: string }> {
  const baseDir = await mkdtemp(join(tmpdir(), "miniagent-headless-export-"));
  const service = await createCLISessionService(baseDir);
  const session = await service.ensureActiveSession();
  const messages: Message[] = [
    { id: "u1", type: MessageType.User, content: "hello" },
    { id: "a1", type: MessageType.Assist, content: "world" },
  ];
  await service.writeMessages(session.id, messages);
  return { baseDir, sessionId: session.id };
}

describe("formatSessionExportResultJson", () => {
  it("formats export results as json", () => {
    expect(formatSessionExportResultJson({
      ok: true,
      sessionId: "s1",
      format: "markdown",
      outputPath: "out.md",
    })).toBe([
      "{",
      "  \"ok\": true,",
      "  \"sessionId\": \"s1\",",
      "  \"format\": \"markdown\",",
      "  \"outputPath\": \"out.md\"",
      "}\n",
    ].join("\n"));
  });
});

describe("runSessionExport", () => {
  it("exports the active session as markdown and prints the output path", async () => {
    const { baseDir } = await setupSession();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionExport({
      baseDir,
      format: "markdown",
      outputPath: "exports/session.md",
    }, { stdout, stderr })).resolves.toBe(0);

    const written = stdout.mock.calls[0]?.[0] as string;
    expect(written).toContain("exports");
    expect(written).toContain("session.md");
    await expect(readFile(join(baseDir, "exports", "session.md"), "utf-8"))
      .resolves.toContain("hello");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("exports a requested session as json and prints a json result", async () => {
    const { baseDir, sessionId } = await setupSession();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionExport({
      baseDir,
      sessionId,
      format: "json",
      outputPath: "exports/session.json",
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining(`"sessionId": "${sessionId}"`));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"format": "json"'));
    await expect(readFile(join(baseDir, "exports", "session.json"), "utf-8"))
      .resolves.toContain('"messages"');
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints export errors as json when requested", async () => {
    const { baseDir } = await setupSession();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionExport({
      baseDir,
      sessionId: "missing",
      output: "json",
    }, { stdout, stderr })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"Session not found: missing\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
  });
});

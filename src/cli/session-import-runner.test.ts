import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MessageType, type Message } from "../core/types.js";
import { createExportService } from "./runtime/export-service.js";
import { createCLISessionService } from "./runtime/session-service.js";
import {
  formatSessionImportResultJson,
  runSessionImport,
} from "./session-import-runner.js";

async function writeExportFile(): Promise<{ baseDir: string; exportPath: string }> {
  const baseDir = await mkdtemp(join(tmpdir(), "miniagent-headless-import-"));
  const service = await createCLISessionService(baseDir);
  const session = await service.ensureActiveSession();
  const messages: Message[] = [
    { id: "u1", type: MessageType.User, content: "hello" },
  ];
  await service.writeMessages(session.id, messages);
  const exportService = createExportService({ baseDir, sessionService: service });
  const exportPath = await exportService.exportJson(session.id, "exports/session.json");
  return { baseDir, exportPath };
}

describe("formatSessionImportResultJson", () => {
  it("formats import results as json", () => {
    expect(formatSessionImportResultJson({
      ok: true,
      sessionId: "s2",
      sessionName: "Imported",
      messageCount: 1,
    })).toBe([
      "{",
      "  \"ok\": true,",
      "  \"sessionId\": \"s2\",",
      "  \"sessionName\": \"Imported\",",
      "  \"messageCount\": 1",
      "}\n",
    ].join("\n"));
  });
});

describe("runSessionImport", () => {
  it("imports a session export and prints the new session id", async () => {
    const { baseDir, exportPath } = await writeExportFile();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionImport({
      baseDir,
      inputPath: exportPath,
      name: "Imported",
    }, { stdout, stderr })).resolves.toBe(0);

    const sessionId = (stdout.mock.calls[0]?.[0] as string).trim();
    const service = await createCLISessionService(baseDir);
    expect(service.getSession(sessionId).name).toBe("Imported");
    await expect(readFile(join(baseDir, ".cliagent", "sessions", sessionId, "data", "messages.jsonl"), "utf-8"))
      .resolves.toContain("hello");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints json when requested", async () => {
    const { baseDir, exportPath } = await writeExportFile();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionImport({
      baseDir,
      inputPath: exportPath,
      name: "Imported",
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"ok": true'));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"sessionName": "Imported"'));
    expect(stderr).not.toHaveBeenCalled();
  });
});

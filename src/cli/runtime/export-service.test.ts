import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MessageType, type Message } from "../../core/types.js";
import { createExportService, CLISessionExportSchema } from "./export-service.js";
import { createCLISessionService } from "./session-service.js";

async function setupSession(): Promise<{
  baseDir: string;
  service: Awaited<ReturnType<typeof createCLISessionService>>;
  sessionId: string;
  messages: Message[];
}> {
  const baseDir = await mkdtemp(join(tmpdir(), "miniagent-export-service-"));
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
  await service.updateSessionModel(session.id, "openai/slow");
  await service.updateSessionMode(session.id, "plan");
  await service.updateSessionTokenUsage(session.id, { input: 10, output: 5, total: 15 });
  return { baseDir, service, sessionId: session.id, messages };
}

describe("ExportService", () => {
  it("exports a session as markdown", async () => {
    const { baseDir, service, sessionId } = await setupSession();
    const exportService = createExportService({ baseDir, sessionService: service });
    const outputPath = await exportService.exportMarkdown(sessionId, "session.md");
    const content = await readFile(outputPath, "utf-8");

    expect(content).toContain("# default");
    expect(content).toContain("- Model: openai/slow");
    expect(content).toContain("- Agent mode: plan");
    expect(content).toContain("- Token usage: 10 in / 5 out / 15 total");
    expect(content).toContain("## user");
    expect(content).toContain("hello");
    expect(content).toContain("## assist");
    expect(content).toContain("world");
  });

  it("exports a session as schema-valid json", async () => {
    const { baseDir, service, sessionId, messages } = await setupSession();
    const exportService = createExportService({ baseDir, sessionService: service });
    const outputPath = await exportService.exportJson(sessionId, "session.json");
    const parsed = CLISessionExportSchema.parse(
      JSON.parse(await readFile(outputPath, "utf-8")) as unknown,
    );

    expect(parsed.version).toBe(1);
    expect(parsed.session.id).toBe(sessionId);
    expect(parsed.session.model).toBe("openai/slow");
    expect(parsed.runtime).toEqual({
      version: 1,
      mode: "plan",
      tokenUsage: { input: 10, output: 5, total: 15 },
    });
    expect(parsed.messages).toEqual(messages);
  });

  it("imports a json session export", async () => {
    const { baseDir, service, sessionId, messages } = await setupSession();
    const exportService = createExportService({ baseDir, sessionService: service });
    const outputPath = await exportService.exportJson(sessionId, "session.json");

    const imported = await exportService.importJson(outputPath, "imported");

    expect(imported.name).toBe("imported");
    expect(await service.readMessages(imported.id)).toEqual(messages);
    expect(await service.readSessionRuntimeMetadata(imported.id)).toEqual({
      version: 1,
      mode: "plan",
      tokenUsage: { input: 10, output: 5, total: 15 },
    });
  });

  it("imports a json session export with a UTF-8 BOM", async () => {
    const { baseDir, service, sessionId, messages } = await setupSession();
    const exportService = createExportService({ baseDir, sessionService: service });
    const outputPath = await exportService.exportJson(sessionId, "session.json");
    const content = await readFile(outputPath, "utf-8");
    await writeFile(outputPath, `\uFEFF${content}`, "utf-8");

    const imported = await exportService.importJson(outputPath, "bom-imported");

    expect(imported.name).toBe("bom-imported");
    expect(await service.readMessages(imported.id)).toEqual(messages);
  });
});

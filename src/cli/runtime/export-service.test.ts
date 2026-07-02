import { mkdtemp, readFile } from "node:fs/promises";
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
  return { baseDir, service, sessionId: session.id, messages };
}

describe("ExportService", () => {
  it("exports a session as markdown", async () => {
    const { baseDir, service, sessionId } = await setupSession();
    const exportService = createExportService({ baseDir, sessionService: service });
    const outputPath = await exportService.exportMarkdown(sessionId, "session.md");
    const content = await readFile(outputPath, "utf-8");

    expect(content).toContain("# default");
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
    expect(parsed.messages).toEqual(messages);
  });

  it("imports a json session export", async () => {
    const { baseDir, service, sessionId, messages } = await setupSession();
    const exportService = createExportService({ baseDir, sessionService: service });
    const outputPath = await exportService.exportJson(sessionId, "session.json");

    const imported = await exportService.importJson(outputPath, "imported");

    expect(imported.name).toBe("imported");
    expect(await service.readMessages(imported.id)).toEqual(messages);
  });
});

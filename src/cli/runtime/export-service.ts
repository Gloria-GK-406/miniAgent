import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { SessionMetaSchema, type SessionMeta } from "../../core/session.js";
import { MessageSchema, type Message, type MessageContent } from "../../core/types.js";
import { resolveWorkspacePath } from "../tools/workspace.js";
import type { CLISessionService } from "./session-service.js";

export const CLISessionExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  session: SessionMetaSchema,
  messages: z.array(MessageSchema),
});

export type CLISessionExport = z.infer<typeof CLISessionExportSchema>;

export interface ExportServiceOptions {
  baseDir: string;
  sessionService: CLISessionService;
}

export interface ExportService {
  exportJson(sessionId: string, outputPath?: string): Promise<string>;
  exportMarkdown(sessionId: string, outputPath?: string): Promise<string>;
  importJson(inputPath: string, name?: string): Promise<SessionMeta>;
}

function safeFileName(value: string): string {
  const safe = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe.length === 0 ? "session" : safe;
}

function resolveOutputPath(baseDir: string, session: SessionMeta, outputPath: string | undefined, extension: string): string {
  const relativePath = outputPath ?? join(".cliagent", "exports", `${safeFileName(session.name)}.${extension}`);
  return resolveWorkspacePath(baseDir, relativePath).absolutePath;
}

function contentToMarkdown(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  if (content.type === "text") {
    return content.text;
  }
  return `[image:${content.mediaType}]`;
}

function messagesToMarkdown(session: SessionMeta, messages: Message[]): string {
  const lines = [
    `# ${session.name}`,
    "",
    `- Session: ${session.id}`,
    `- Created: ${session.createdAt}`,
    `- Updated: ${session.updatedAt}`,
    `- Messages: ${messages.length}`,
    "",
  ];

  for (const message of messages) {
    lines.push(`## ${message.type}`);
    lines.push("");
    lines.push(contentToMarkdown(message.content));
    lines.push("");
  }

  return lines.join("\n");
}

function buildExport(session: SessionMeta, messages: Message[]): CLISessionExport {
  return CLISessionExportSchema.parse({
    version: 1,
    exportedAt: new Date().toISOString(),
    session,
    messages,
  });
}

export function createExportService(options: ExportServiceOptions): ExportService {
  async function writeOutput(path: string, content: string): Promise<string> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf-8");
    return path;
  }

  return {
    exportJson: async (sessionId, outputPath) => {
      const session = options.sessionService.getSession(sessionId);
      const messages = await options.sessionService.readMessages(sessionId);
      const target = resolveOutputPath(options.baseDir, session, outputPath, "json");
      const payload = buildExport(session, messages);
      return writeOutput(target, `${JSON.stringify(payload, null, 2)}\n`);
    },
    exportMarkdown: async (sessionId, outputPath) => {
      const session = options.sessionService.getSession(sessionId);
      const messages = await options.sessionService.readMessages(sessionId);
      const target = resolveOutputPath(options.baseDir, session, outputPath, "md");
      return writeOutput(target, messagesToMarkdown(session, messages));
    },
    importJson: async (inputPath, name) => {
      const sourcePath = resolveWorkspacePath(options.baseDir, inputPath).absolutePath;
      const parsed = CLISessionExportSchema.parse(
        JSON.parse(await readFile(sourcePath, "utf-8")) as unknown,
      );
      const session = await options.sessionService.createSession(name ?? parsed.session.name);
      await options.sessionService.writeMessages(session.id, parsed.messages);
      return options.sessionService.getSession(session.id);
    },
  };
}

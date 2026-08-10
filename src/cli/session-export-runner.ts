import { z } from "zod";
import { createExportService } from "./runtime/export-service.js";
import { createCLISessionService } from "./runtime/session-service.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";

export const SessionExportFormatSchema = z.enum(["json", "markdown"]);
export type SessionExportFormat = z.infer<typeof SessionExportFormatSchema>;
export const SessionExportOutputSchema = z.enum(["text", "json"]);
export type SessionExportOutput = z.infer<typeof SessionExportOutputSchema>;

export const SessionExportRequestSchema = z.object({
  baseDir: z.string(),
  sessionId: z.string().optional(),
  format: SessionExportFormatSchema.optional(),
  outputPath: z.string().optional(),
  output: SessionExportOutputSchema.optional(),
});
export type SessionExportRequest = z.infer<typeof SessionExportRequestSchema>;

export const SessionExportResultSchema = z.object({
  ok: z.boolean(),
  sessionId: z.string(),
  format: SessionExportFormatSchema,
  outputPath: z.string(),
});
export type SessionExportResult = z.infer<typeof SessionExportResultSchema>;

export function formatSessionExportResultJson(result: SessionExportResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runSessionExport(
  request: SessionExportRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const sessionService = await createCLISessionService(request.baseDir);
    const session = request.sessionId === undefined
      ? await sessionService.ensureActiveSession()
      : sessionService.getSession(request.sessionId);
    const format = request.format ?? "markdown";
    const exportService = createExportService({
      baseDir: request.baseDir,
      sessionService,
    });
    const outputPath = format === "json"
      ? await exportService.exportJson(session.id, request.outputPath)
      : await exportService.exportMarkdown(session.id, request.outputPath);
    const result = {
      ok: true,
      sessionId: session.id,
      format,
      outputPath,
    };
    streams.stdout(
      output === "json"
        ? formatSessionExportResultJson(result)
        : `${outputPath}\n`,
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

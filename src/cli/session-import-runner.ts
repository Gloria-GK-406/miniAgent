import { z } from "zod";
import { createExportService } from "./runtime/export-service.js";
import { createCLISessionService } from "./runtime/session-service.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";

export const SessionImportOutputSchema = z.enum(["text", "json"]);
export type SessionImportOutput = z.infer<typeof SessionImportOutputSchema>;

export const SessionImportRequestSchema = z.object({
  baseDir: z.string(),
  inputPath: z.string(),
  name: z.string().optional(),
  output: SessionImportOutputSchema.optional(),
});
export type SessionImportRequest = z.infer<typeof SessionImportRequestSchema>;

export const SessionImportResultSchema = z.object({
  ok: z.boolean(),
  sessionId: z.string(),
  sessionName: z.string(),
  messageCount: z.number(),
});
export type SessionImportResult = z.infer<typeof SessionImportResultSchema>;

export function formatSessionImportResultJson(result: SessionImportResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runSessionImport(
  request: SessionImportRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const sessionService = await createCLISessionService(request.baseDir);
    const exportService = createExportService({
      baseDir: request.baseDir,
      sessionService,
    });
    const session = await exportService.importJson(request.inputPath, request.name);
    const result = {
      ok: true,
      sessionId: session.id,
      sessionName: session.name,
      messageCount: session.messageCount,
    };
    streams.stdout(
      output === "json"
        ? formatSessionImportResultJson(result)
        : `${session.id}\n`,
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

import { createExportService } from "./runtime/export-service.js";
import { createCLISessionService } from "./runtime/session-service.js";
import type { PrintStreams } from "./print-runner.js";

export type SessionExportFormat = "json" | "markdown";
export type SessionExportOutput = "text" | "json";

export interface SessionExportRequest {
  baseDir: string;
  sessionId?: string;
  format?: SessionExportFormat;
  outputPath?: string;
  output?: SessionExportOutput;
}

export interface SessionExportResult {
  ok: boolean;
  sessionId: string;
  format: SessionExportFormat;
  outputPath: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatSessionExportResultJson(result: SessionExportResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runSessionExport(
  request: SessionExportRequest,
  streams: PrintStreams,
): Promise<number> {
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
      request.output === "json"
        ? formatSessionExportResultJson(result)
        : `${outputPath}\n`,
    );
    return 0;
  } catch (error: unknown) {
    streams.stderr(`${errorMessage(error)}\n`);
    return 1;
  }
}

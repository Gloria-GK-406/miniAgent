import { createExportService } from "./runtime/export-service.js";
import { createCLISessionService } from "./runtime/session-service.js";
import type { PrintStreams } from "./print-runner.js";

export type SessionImportOutput = "text" | "json";

export interface SessionImportRequest {
  baseDir: string;
  inputPath: string;
  name?: string;
  output?: SessionImportOutput;
}

export interface SessionImportResult {
  ok: boolean;
  sessionId: string;
  sessionName: string;
  messageCount: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatSessionImportResultJson(result: SessionImportResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runSessionImport(
  request: SessionImportRequest,
  streams: PrintStreams,
): Promise<number> {
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
      request.output === "json"
        ? formatSessionImportResultJson(result)
        : `${session.id}\n`,
    );
    return 0;
  } catch (error: unknown) {
    streams.stderr(`${errorMessage(error)}\n`);
    return 1;
  }
}

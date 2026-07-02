import type { PrintStreams } from "./print-runner.js";
import { createCLISessionService } from "./runtime/session-service.js";

export type SessionRenameOutput = "text" | "json";

export interface SessionRenameRequest {
  baseDir: string;
  sessionId: string;
  name: string;
  output?: SessionRenameOutput;
}

export interface SessionRenameResult {
  ok: boolean;
  sessionId: string;
  sessionName: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatSessionRenameResultJson(result: SessionRenameResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runSessionRename(
  request: SessionRenameRequest,
  streams: PrintStreams,
): Promise<number> {
  try {
    const sessionService = await createCLISessionService(request.baseDir);
    const session = await sessionService.renameSession(request.sessionId, request.name);
    const result = {
      ok: true,
      sessionId: session.id,
      sessionName: session.name,
    };
    streams.stdout(
      request.output === "json"
        ? formatSessionRenameResultJson(result)
        : `Renamed session ${session.id}\n`,
    );
    return 0;
  } catch (error: unknown) {
    streams.stderr(`${errorMessage(error)}\n`);
    return 1;
  }
}

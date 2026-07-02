import type { PrintStreams } from "./print-runner.js";
import { createCLISessionService } from "./runtime/session-service.js";

export type SessionDeleteOutput = "text" | "json";

export interface SessionDeleteRequest {
  baseDir: string;
  sessionId: string;
  output?: SessionDeleteOutput;
}

export interface SessionDeleteResult {
  ok: boolean;
  sessionId: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatSessionDeleteResultJson(result: SessionDeleteResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runSessionDelete(
  request: SessionDeleteRequest,
  streams: PrintStreams,
): Promise<number> {
  try {
    const sessionService = await createCLISessionService(request.baseDir);
    await sessionService.deleteSession(request.sessionId);
    const result = {
      ok: true,
      sessionId: request.sessionId,
    };
    streams.stdout(
      request.output === "json"
        ? formatSessionDeleteResultJson(result)
        : `Deleted session ${request.sessionId}\n`,
    );
    return 0;
  } catch (error: unknown) {
    streams.stderr(`${errorMessage(error)}\n`);
    return 1;
  }
}

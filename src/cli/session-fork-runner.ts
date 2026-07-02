import type { PrintStreams } from "./print-runner.js";
import { createCLISessionService } from "./runtime/session-service.js";

export type SessionForkOutput = "text" | "json";

export interface SessionForkRequest {
  baseDir: string;
  sessionId: string;
  name?: string;
  output?: SessionForkOutput;
}

export interface SessionForkResult {
  ok: boolean;
  sessionId: string;
  sessionName: string;
  sourceSessionId: string;
  messageCount: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatSessionForkResultJson(result: SessionForkResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runSessionFork(
  request: SessionForkRequest,
  streams: PrintStreams,
): Promise<number> {
  try {
    const sessionService = await createCLISessionService(request.baseDir);
    const session = await sessionService.forkSession(request.sessionId, request.name);
    const result = {
      ok: true,
      sessionId: session.id,
      sessionName: session.name,
      sourceSessionId: request.sessionId,
      messageCount: session.messageCount,
    };
    streams.stdout(
      request.output === "json"
        ? formatSessionForkResultJson(result)
        : `${session.id}\n`,
    );
    return 0;
  } catch (error: unknown) {
    streams.stderr(`${errorMessage(error)}\n`);
    return 1;
  }
}

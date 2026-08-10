import { z } from "zod";
import type { PrintStreams } from "./print-runner.js";
import { createCLISessionService } from "./runtime/session-service.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";

export const SessionForkOutputSchema = z.enum(["text", "json"]);
export type SessionForkOutput = z.infer<typeof SessionForkOutputSchema>;

export const SessionForkRequestSchema = z.object({
  baseDir: z.string(),
  sessionId: z.string(),
  name: z.string().optional(),
  output: SessionForkOutputSchema.optional(),
}) as z.ZodType<{
  baseDir: string;
  sessionId: string;
  name?: string;
  output?: SessionForkOutput;
}>;
export type SessionForkRequest = z.infer<typeof SessionForkRequestSchema>;

export const SessionForkResultSchema = z.object({
  ok: z.boolean(),
  sessionId: z.string(),
  sessionName: z.string(),
  sourceSessionId: z.string(),
  messageCount: z.number(),
}) as z.ZodType<{
  ok: boolean;
  sessionId: string;
  sessionName: string;
  sourceSessionId: string;
  messageCount: number;
}>;
export type SessionForkResult = z.infer<typeof SessionForkResultSchema>;

export function formatSessionForkResultJson(result: SessionForkResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runSessionFork(
  request: SessionForkRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
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
      output === "json"
        ? formatSessionForkResultJson(result)
        : `${session.id}\n`,
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

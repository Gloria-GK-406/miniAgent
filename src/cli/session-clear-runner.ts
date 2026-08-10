import { z } from "zod";
import type { PrintStreams } from "./print-runner.js";
import { createCLISessionService } from "./runtime/session-service.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";

export const SessionClearOutputSchema = z.enum(["text", "json"]);
export type SessionClearOutput = z.infer<typeof SessionClearOutputSchema>;

const EMPTY_TOKEN_USAGE = { input: 0, output: 0, total: 0 } as const;

export const SessionClearRequestSchema = z.object({
  baseDir: z.string(),
  sessionId: z.string().optional(),
  output: SessionClearOutputSchema.optional(),
}) as z.ZodType<{
  baseDir: string;
  sessionId?: string;
  output?: SessionClearOutput;
}>;
export type SessionClearRequest = z.infer<typeof SessionClearRequestSchema>;

export const SessionClearResultSchema = z.object({
  ok: z.boolean(),
  sessionId: z.string(),
  sessionName: z.string(),
  messageCount: z.number(),
}) as z.ZodType<{
  ok: boolean;
  sessionId: string;
  sessionName: string;
  messageCount: number;
}>;
export type SessionClearResult = z.infer<typeof SessionClearResultSchema>;

export function formatSessionClearResultJson(result: SessionClearResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runSessionClear(
  request: SessionClearRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const sessionService = await createCLISessionService(request.baseDir);
    const session = request.sessionId === undefined
      ? await sessionService.ensureActiveSession()
      : sessionService.getSession(request.sessionId);
    await sessionService.writeMessages(session.id, []);
    await sessionService.updateSessionTokenUsage(session.id, EMPTY_TOKEN_USAGE);
    const cleared = sessionService.getSession(session.id);
    const result = {
      ok: true,
      sessionId: cleared.id,
      sessionName: cleared.name,
      messageCount: cleared.messageCount,
    };
    streams.stdout(
      output === "json"
        ? formatSessionClearResultJson(result)
        : `Cleared session ${cleared.id}\n`,
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

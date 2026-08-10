import { z } from "zod";
import type { PrintStreams } from "./print-runner.js";
import { createCLISessionService } from "./runtime/session-service.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";

export const SessionRenameOutputSchema = z.enum(["text", "json"]);
export type SessionRenameOutput = z.infer<typeof SessionRenameOutputSchema>;

export const SessionRenameRequestSchema = z.object({
  baseDir: z.string(),
  sessionId: z.string(),
  name: z.string(),
  output: SessionRenameOutputSchema.optional(),
}) as z.ZodType<{
  baseDir: string;
  sessionId: string;
  name: string;
  output?: SessionRenameOutput;
}>;
export type SessionRenameRequest = z.infer<typeof SessionRenameRequestSchema>;

export const SessionRenameResultSchema = z.object({
  ok: z.boolean(),
  sessionId: z.string(),
  sessionName: z.string(),
}) as z.ZodType<{
  ok: boolean;
  sessionId: string;
  sessionName: string;
}>;
export type SessionRenameResult = z.infer<typeof SessionRenameResultSchema>;

export function formatSessionRenameResultJson(result: SessionRenameResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runSessionRename(
  request: SessionRenameRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const sessionService = await createCLISessionService(request.baseDir);
    const session = await sessionService.renameSession(request.sessionId, request.name);
    const result = {
      ok: true,
      sessionId: session.id,
      sessionName: session.name,
    };
    streams.stdout(
      output === "json"
        ? formatSessionRenameResultJson(result)
        : `Renamed session ${session.id}\n`,
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

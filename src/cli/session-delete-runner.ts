import { z } from "zod";
import type { PrintStreams } from "./print-runner.js";
import { createCLISessionService } from "./runtime/session-service.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";

export const SessionDeleteOutputSchema = z.enum(["text", "json"]);
export type SessionDeleteOutput = z.infer<typeof SessionDeleteOutputSchema>;

export const SessionDeleteRequestSchema = z.object({
  baseDir: z.string(),
  sessionId: z.string(),
  output: SessionDeleteOutputSchema.optional(),
}) as z.ZodType<{
  baseDir: string;
  sessionId: string;
  output?: SessionDeleteOutput;
}>;
export type SessionDeleteRequest = z.infer<typeof SessionDeleteRequestSchema>;

export const SessionDeleteResultSchema = z.object({
  ok: z.boolean(),
  sessionId: z.string(),
}) as z.ZodType<{
  ok: boolean;
  sessionId: string;
}>;
export type SessionDeleteResult = z.infer<typeof SessionDeleteResultSchema>;

export function formatSessionDeleteResultJson(result: SessionDeleteResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runSessionDelete(
  request: SessionDeleteRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const sessionService = await createCLISessionService(request.baseDir);
    await sessionService.deleteSession(request.sessionId);
    const result = {
      ok: true,
      sessionId: request.sessionId,
    };
    streams.stdout(
      output === "json"
        ? formatSessionDeleteResultJson(result)
        : `Deleted session ${request.sessionId}\n`,
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

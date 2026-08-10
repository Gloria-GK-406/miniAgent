import { z } from "zod";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";
import { createReferenceService } from "./runtime/reference-service.js";

export const ReferenceListOutputSchema = z.enum(["text", "json"]);
export type ReferenceListOutput = z.infer<typeof ReferenceListOutputSchema>;

export const ReferenceListRequestSchema = z.object({
  baseDir: z.string(),
  output: ReferenceListOutputSchema.optional(),
}) as z.ZodType<{
  baseDir: string;
  output?: ReferenceListOutput;
}>;
export type ReferenceListRequest = z.infer<typeof ReferenceListRequestSchema>;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function formatReferenceList(references: string[]): string {
  if (references.length === 0) {
    return "No reference candidates\n";
  }
  return [
    `Reference candidates (${plural(references.length, "file")})`,
    ...references,
    "",
  ].join("\n");
}

export function formatReferenceListJson(references: string[]): string {
  return `${JSON.stringify({ ok: true, references }, null, 2)}\n`;
}

export async function runReferenceList(
  request: ReferenceListRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const references = await createReferenceService(request.baseDir).listReferenceCandidates();
    streams.stdout(
      output === "json"
        ? formatReferenceListJson(references)
        : formatReferenceList(references),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

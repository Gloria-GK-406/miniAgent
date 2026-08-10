import { z } from "zod";
import type { PrintStreams } from "./print-runner.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import { createProjectInstructionsService } from "./runtime/project-instructions-service.js";

export const ProjectInstructionsInitOutputSchema = z.enum(["text", "json"]);
export type ProjectInstructionsInitOutput = z.infer<typeof ProjectInstructionsInitOutputSchema>;

export const ProjectInstructionsInitRequestSchema = z.object({
  baseDir: z.string(),
  force: z.boolean().optional(),
  output: ProjectInstructionsInitOutputSchema.optional(),
}) as z.ZodType<{
  baseDir: string;
  force?: boolean;
  output?: ProjectInstructionsInitOutput;
}>;
export type ProjectInstructionsInitRequest = z.infer<typeof ProjectInstructionsInitRequestSchema>;

export const ProjectInstructionsInitResultSchema = z.object({
  ok: z.boolean(),
  path: z.string(),
  written: z.boolean(),
}) as z.ZodType<{
  ok: boolean;
  path: string;
  written: boolean;
}>;
export type ProjectInstructionsInitResult = z.infer<typeof ProjectInstructionsInitResultSchema>;

export function formatProjectInstructionsInitJson(result: ProjectInstructionsInitResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function formatProjectInstructionsInitText(result: ProjectInstructionsInitResult): string {
  return result.written
    ? `Wrote project instructions ${result.path}\n`
    : `Project instructions already exist ${result.path}\n`;
}

export async function runProjectInstructionsInit(
  request: ProjectInstructionsInitRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const service = createProjectInstructionsService(request.baseDir);
    const initialized = await service.initialize({ overwrite: request.force === true });
    const result = {
      ok: true,
      path: initialized.path,
      written: initialized.written,
    };
    streams.stdout(
      output === "json"
        ? formatProjectInstructionsInitJson(result)
        : formatProjectInstructionsInitText(result),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

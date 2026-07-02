import type { PrintStreams } from "./print-runner.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import { createProjectInstructionsService } from "./runtime/project-instructions-service.js";

export type ProjectInstructionsInitOutput = "text" | "json";

export interface ProjectInstructionsInitRequest {
  baseDir: string;
  force?: boolean;
  output?: ProjectInstructionsInitOutput;
}

export interface ProjectInstructionsInitResult {
  ok: boolean;
  path: string;
  written: boolean;
}

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

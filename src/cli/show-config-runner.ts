import { z } from "zod";
import { LoadConfigOptionsSchema, loadConfig, type CLIConfig, type LoadConfigOptions } from "./config.js";
import { formatConfigForDisplay } from "./config-display.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";

export const ShowConfigOutputSchema = z.enum(["text", "json"]);
export type ShowConfigOutput = z.infer<typeof ShowConfigOutputSchema>;

export const ShowConfigRequestSchema = z.intersection(z.lazy(() => LoadConfigOptionsSchema), z.object({
  baseDir: z.string(),
  output: ShowConfigOutputSchema.optional(),
})) as z.ZodType<LoadConfigOptions & {
  baseDir: string;
  output?: ShowConfigOutput;
}>;
export type ShowConfigRequest = z.infer<typeof ShowConfigRequestSchema>;

export function formatShowConfigJson(config: unknown): string {
  return formatConfigForDisplay(config);
}

async function loadConfigForDisplay(request: ShowConfigRequest): Promise<CLIConfig> {
  return await loadConfig(request.baseDir, {
    ...(request.env !== undefined && { env: request.env }),
    ...(request.platform !== undefined && { platform: request.platform }),
    ...(request.homeDir !== undefined && { homeDir: request.homeDir }),
    createTemplateIfMissing: false,
  });
}

export async function runShowConfig(
  request: ShowConfigRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const config = await loadConfigForDisplay(request);
    streams.stdout(formatShowConfigJson(config));
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

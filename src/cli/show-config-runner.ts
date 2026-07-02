import { loadConfig, type CLIConfig, type LoadConfigOptions } from "./config.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";

export type ShowConfigOutput = "text" | "json";

export interface ShowConfigRequest extends LoadConfigOptions {
  baseDir: string;
  output?: ShowConfigOutput;
}

export function formatShowConfigJson(config: unknown): string {
  return `${JSON.stringify(config, null, 2)}\n`;
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

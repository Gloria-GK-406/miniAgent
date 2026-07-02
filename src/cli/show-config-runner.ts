import { loadConfig, type CLIConfig, type LoadConfigOptions } from "./config.js";
import type { PrintStreams } from "./print-runner.js";

export type ShowConfigOutput = "text" | "json";

export interface ShowConfigRequest extends LoadConfigOptions {
  baseDir: string;
  output?: ShowConfigOutput;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  try {
    const config = await loadConfigForDisplay(request);
    streams.stdout(formatShowConfigJson(config));
    return 0;
  } catch (error: unknown) {
    streams.stderr(`${errorMessage(error)}\n`);
    return 1;
  }
}

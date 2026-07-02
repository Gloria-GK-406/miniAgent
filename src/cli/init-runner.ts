import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CLIAGENT_DIR, createDefaultConfigTemplate } from "./config.js";
import type { PrintStreams } from "./print-runner.js";

export type InitConfigOutput = "text" | "json";

export interface InitConfigRequest {
  baseDir: string;
  force?: boolean;
  output?: InitConfigOutput;
}

export interface InitConfigResult {
  ok: boolean;
  configPath: string;
  overwritten: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatInitConfigResultJson(result: InitConfigResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runInitConfig(
  request: InitConfigRequest,
  streams: PrintStreams,
): Promise<number> {
  const configPath = join(request.baseDir, CLIAGENT_DIR, "config.json");
  try {
    await mkdir(dirname(configPath), { recursive: true });
    const template = createDefaultConfigTemplate(request.baseDir);
    await writeFile(configPath, JSON.stringify(template, null, 2), {
      encoding: "utf-8",
      flag: request.force === true ? "w" : "wx",
    });
    const result = {
      ok: true,
      configPath,
      overwritten: request.force === true,
    };
    streams.stdout(
      request.output === "json"
        ? formatInitConfigResultJson(result)
        : `${request.force === true ? "Reinitialized" : "Created"} config ${configPath}\n`,
    );
    return 0;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      streams.stderr(`Config already exists: ${configPath}\n`);
      return 1;
    }
    streams.stderr(`${errorMessage(error)}\n`);
    return 1;
  }
}

import { join } from "node:path";
import { CLIAGENT_DIR, getGlobalConfigPath, type LoadConfigOptions } from "./config.js";
import type { PrintStreams } from "./print-runner.js";

export type ConfigPathsOutput = "text" | "json";

export interface ConfigPathsRequest extends LoadConfigOptions {
  baseDir: string;
  output?: ConfigPathsOutput;
}

export interface ConfigPathsResult {
  projectConfigPath: string;
  globalConfigPath: string;
}

export function resolveConfigPaths(
  baseDir: string,
  options: LoadConfigOptions = {},
): ConfigPathsResult {
  return {
    projectConfigPath: join(baseDir, CLIAGENT_DIR, "config.json"),
    globalConfigPath: getGlobalConfigPath(options),
  };
}

export function formatConfigPaths(paths: ConfigPathsResult): string {
  return [
    `Project config: ${paths.projectConfigPath}`,
    `Global config: ${paths.globalConfigPath}`,
    "",
  ].join("\n");
}

export function formatConfigPathsJson(paths: ConfigPathsResult): string {
  return `${JSON.stringify(paths, null, 2)}\n`;
}

export function runConfigPaths(
  request: ConfigPathsRequest,
  streams: PrintStreams,
): number {
  const paths = resolveConfigPaths(request.baseDir, {
    ...(request.env !== undefined && { env: request.env }),
    ...(request.platform !== undefined && { platform: request.platform }),
    ...(request.homeDir !== undefined && { homeDir: request.homeDir }),
  });
  streams.stdout(
    request.output === "json"
      ? formatConfigPathsJson(paths)
      : formatConfigPaths(paths),
  );
  return 0;
}

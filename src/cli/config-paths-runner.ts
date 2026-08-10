import { z } from "zod";
import { join } from "node:path";
import { LoadConfigOptionsSchema, CLIAGENT_DIR, getGlobalConfigPath, type LoadConfigOptions } from "./config.js";
import type { PrintStreams } from "./print-runner.js";

export const ConfigPathsOutputSchema = z.enum(["text", "json"]);
export type ConfigPathsOutput = z.infer<typeof ConfigPathsOutputSchema>;

export const ConfigPathsRequestSchema = z.intersection(z.lazy(() => LoadConfigOptionsSchema), z.object({
  baseDir: z.string(),
  output: ConfigPathsOutputSchema.optional(),
})) as z.ZodType<LoadConfigOptions & {
  baseDir: string;
  output?: ConfigPathsOutput;
}>;
export type ConfigPathsRequest = z.infer<typeof ConfigPathsRequestSchema>;

export const ConfigPathsResultSchema = z.object({
  projectConfigPath: z.string(),
  globalConfigPath: z.string(),
}) as z.ZodType<{
  projectConfigPath: string;
  globalConfigPath: string;
}>;
export type ConfigPathsResult = z.infer<typeof ConfigPathsResultSchema>;

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

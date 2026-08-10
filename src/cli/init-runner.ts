import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CLIAGENT_DIR, createDefaultConfigTemplate } from "./config.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";

export const InitConfigOutputSchema = z.enum(["text", "json"]);
export type InitConfigOutput = z.infer<typeof InitConfigOutputSchema>;

export const InitConfigRequestSchema = z.object({
  baseDir: z.string(),
  force: z.boolean().optional(),
  output: InitConfigOutputSchema.optional(),
});
export type InitConfigRequest = z.infer<typeof InitConfigRequestSchema>;

export const InitConfigResultSchema = z.object({
  ok: z.boolean(),
  configPath: z.string(),
  overwritten: z.boolean(),
});
export type InitConfigResult = z.infer<typeof InitConfigResultSchema>;

export function formatInitConfigResultJson(result: InitConfigResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runInitConfig(
  request: InitConfigRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
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
      output === "json"
        ? formatInitConfigResultJson(result)
        : `${request.force === true ? "Reinitialized" : "Created"} config ${configPath}\n`,
    );
    return 0;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      writeHeadlessError(streams, `Config already exists: ${configPath}`, output);
      return 1;
    }
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

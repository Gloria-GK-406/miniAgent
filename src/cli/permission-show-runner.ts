import { z } from "zod";
import { loadConfig, type CLIPermissionConfig } from "./config.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";

export const PermissionShowOutputSchema = z.enum(["text", "json"]);
export type PermissionShowOutput = z.infer<typeof PermissionShowOutputSchema>;

export const PermissionShowRequestSchema = z.object({
  baseDir: z.string(),
  output: PermissionShowOutputSchema.optional(),
}) as z.ZodType<{
  baseDir: string;
  output?: PermissionShowOutput;
}>;
export type PermissionShowRequest = z.infer<typeof PermissionShowRequestSchema>;

export function formatPermissionPolicy(permission: CLIPermissionConfig): string {
  const lines = ["Permissions"];
  for (const [target, rule] of Object.entries(permission)) {
    if (typeof rule === "string") {
      lines.push(`${target}: ${rule}`);
      continue;
    }
    lines.push(`${target}:`);
    for (const [pattern, decision] of Object.entries(rule)) {
      lines.push(`  ${pattern}: ${decision}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function formatPermissionPolicyJson(permission: CLIPermissionConfig): string {
  return `${JSON.stringify({ ok: true, permission }, null, 2)}\n`;
}

export async function runPermissionShow(
  request: PermissionShowRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const config = await loadConfig(request.baseDir, { createTemplateIfMissing: false });
    streams.stdout(
      output === "json"
        ? formatPermissionPolicyJson(config.permission)
        : formatPermissionPolicy(config.permission),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

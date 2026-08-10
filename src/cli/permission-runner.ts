import { z } from "zod";
import { CLIPermissionDecisionSchema, loadConfig, type CLIPermissionDecision } from "./config.js";
import type { PrintStreams } from "./print-runner.js";
import { createPermissionConfigService } from "./runtime/permission-config-service.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";

export const PermissionUpdateOutputSchema = z.enum(["text", "json"]);
export type PermissionUpdateOutput = z.infer<typeof PermissionUpdateOutputSchema>;
export const PermissionUpdateActionSchema = z.enum(["set", "unset"]);
export type PermissionUpdateAction = z.infer<typeof PermissionUpdateActionSchema>;

export const PermissionUpdateRequestSchema = z.object({
  baseDir: z.string(),
  action: PermissionUpdateActionSchema,
  target: z.string(),
  decision: z.lazy(() => CLIPermissionDecisionSchema).optional(),
  output: PermissionUpdateOutputSchema.optional(),
}) as z.ZodType<{
  baseDir: string;
  action: PermissionUpdateAction;
  target: string;
  decision?: CLIPermissionDecision;
  output?: PermissionUpdateOutput;
}>;
export type PermissionUpdateRequest = z.infer<typeof PermissionUpdateRequestSchema>;

export const PermissionUpdateResultSchema = z.object({
  ok: z.boolean(),
  action: PermissionUpdateActionSchema,
  target: z.string(),
  decision: z.lazy(() => CLIPermissionDecisionSchema).optional(),
}) as z.ZodType<{
  ok: boolean;
  action: PermissionUpdateAction;
  target: string;
  decision?: CLIPermissionDecision;
}>;
export type PermissionUpdateResult = z.infer<typeof PermissionUpdateResultSchema>;

export function formatPermissionUpdateResultJson(result: PermissionUpdateResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function formatPermissionUpdateText(result: PermissionUpdateResult): string {
  if (result.action === "set") {
    return `Set permission ${result.target} to ${result.decision}\n`;
  }
  return `Unset permission ${result.target}\n`;
}

export async function runPermissionUpdate(
  request: PermissionUpdateRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const service = createPermissionConfigService(request.baseDir);
    if (request.action === "set") {
      if (request.decision === undefined) {
        throw new Error("Missing permission decision");
      }
      const effective = await loadConfig(request.baseDir, { createTemplateIfMissing: false });
      await service.setRule(request.target, request.decision, effective.permission);
    } else {
      await service.unsetRule(request.target);
    }

    const result = {
      ok: true,
      action: request.action,
      target: request.target,
      ...(request.decision !== undefined && { decision: request.decision }),
    };
    streams.stdout(
      output === "json"
        ? formatPermissionUpdateResultJson(result)
        : formatPermissionUpdateText(result),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

import { z } from "zod";
import { CLIEntrySnapshotActionSchema, type CLIEntrySnapshotAction } from "./entry-args.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";
import type { CLIAppRuntime } from "./runtime/types.js";

export const SnapshotActionOutputSchema = z.enum(["text", "json"]);
export type SnapshotActionOutput = z.infer<typeof SnapshotActionOutputSchema>;

export const SnapshotActionResultSchema = z.object({
  ok: z.literal(true),
  action: z.lazy(() => CLIEntrySnapshotActionSchema),
  turnId: z.string(),
}) as z.ZodType<{
  ok: true;
  action: CLIEntrySnapshotAction;
  turnId: string;
}>;
export type SnapshotActionResult = z.infer<typeof SnapshotActionResultSchema>;

export function formatSnapshotActionResult(result: SnapshotActionResult): string {
  const verb = result.action === "restore" ? "Restored" : "Reapplied";
  return `${verb} snapshot ${result.turnId}\n`;
}

export function formatSnapshotActionResultJson(result: SnapshotActionResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export async function runSnapshotAction(
  runtime: CLIAppRuntime,
  streams: PrintStreams,
  options: {
    action: CLIEntrySnapshotAction;
    turnId: string;
    output?: SnapshotActionOutput;
  },
): Promise<number> {
  const output = options.output ?? "text";
  try {
    if (options.action === "restore") {
      await runtime.restoreSnapshot(options.turnId);
    } else {
      await runtime.reapplySnapshot(options.turnId);
    }
    const result: SnapshotActionResult = {
      ok: true,
      action: options.action,
      turnId: options.turnId,
    };
    streams.stdout(output === "json"
      ? formatSnapshotActionResultJson(result)
      : formatSnapshotActionResult(result));
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  } finally {
    await runtime.destroy();
  }
}

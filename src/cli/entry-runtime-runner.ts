import { z } from "zod";
import { resolve } from "node:path";
import {
  CLIEntryActionSchema,
  type CLIEntryAction,
  type CLIEntryOutput,
} from "./entry-args.js";
import { writeCLIEntryError } from "./entry-fatal.js";
import { applyCLIEntryRuntimeOptions } from "./entry-runtime-options.js";
import type { PrintStreams } from "./print-runner.js";
import type { CLIAppRuntime } from "./runtime/types.js";

type RuntimeBackedCLIEntryActionType =
  | "print"
  | "doctor"
  | "status"
  | "overview"
  | "list-tools"
  | "list-todos"
  | "list-agents"
  | "preview-context"
  | "show-history"
  | "search-all"
  | "list-snapshots"
  | "snapshot-action";

const RUNTIME_BACKED_ACTION_TYPES = new Set<RuntimeBackedCLIEntryActionType>([
  "print",
  "doctor",
  "status",
  "overview",
  "list-tools",
  "list-todos",
  "list-agents",
  "preview-context",
  "show-history",
  "search-all",
  "list-snapshots",
  "snapshot-action",
]);

export const RuntimeBackedCLIEntryActionSchema = CLIEntryActionSchema.refine(
  (action) => RUNTIME_BACKED_ACTION_TYPES.has(action.type as RuntimeBackedCLIEntryActionType),
) as z.ZodType<Extract<CLIEntryAction, { type: RuntimeBackedCLIEntryActionType }>>;
export type RuntimeBackedCLIEntryAction = z.infer<typeof RuntimeBackedCLIEntryActionSchema>;

export function RuntimeBackedCLIEntryOptionsSchema<TPrepared = void>() {
  return z.custom<{
  action: RuntimeBackedCLIEntryAction;
  createRuntime: (cwd: string) => Promise<CLIAppRuntime>;
  streams: PrintStreams;
  prepare?: (runtime: CLIAppRuntime, cwd: string) => Promise<TPrepared>;
  run: (runtime: CLIAppRuntime, prepared: TPrepared, cwd: string) => Promise<number>;
}>();
}
export type RuntimeBackedCLIEntryOptions<TPrepared = void> = z.infer<ReturnType<typeof RuntimeBackedCLIEntryOptionsSchema<TPrepared>>>;

function outputFor(action: RuntimeBackedCLIEntryAction): CLIEntryOutput {
  return action.output ?? "text";
}

export async function runRuntimeBackedCLIEntry<TPrepared = void>(
  options: RuntimeBackedCLIEntryOptions<TPrepared>,
): Promise<number> {
  const output = outputFor(options.action);
  let runtime: CLIAppRuntime | undefined;
  try {
    const cwd = resolve(options.action.cwd ?? process.cwd());
    runtime = await options.createRuntime(cwd);
    await applyCLIEntryRuntimeOptions(runtime, options.action);
    const prepared = options.prepare === undefined
      ? undefined as TPrepared
      : await options.prepare(runtime, cwd);
    const ownedRuntime = runtime;
    runtime = undefined;
    return await options.run(ownedRuntime, prepared, cwd);
  } catch (error: unknown) {
    if (runtime !== undefined) {
      try {
        await runtime.destroy();
      } catch (cleanupError: unknown) {
        return writeCLIEntryError(options.streams, cleanupError, output);
      }
    }
    return writeCLIEntryError(options.streams, error, output);
  }
}

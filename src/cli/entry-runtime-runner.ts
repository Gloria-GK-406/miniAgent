import { z } from "zod";
import { resolve } from "node:path";
import { createFunctionSchema } from "../core/index.js";
import {
  CLIEntryActionSchema,
  type CLIEntryOutput,
} from "./entry-args.js";
import { writeCLIEntryError } from "./entry-fatal.js";
import { applyCLIEntryRuntimeOptions } from "./entry-runtime-options.js";
import { PrintStreamsSchema } from "./print-runner.js";
import type { CLIAppRuntime } from "./runtime/types.js";

export const RuntimeBackedCLIEntryActionSchema = z.union([
  CLIEntryActionSchema.options[1],
  CLIEntryActionSchema.options[2],
  CLIEntryActionSchema.options[4],
  CLIEntryActionSchema.options[5],
  CLIEntryActionSchema.options[22],
  CLIEntryActionSchema.options[23],
  CLIEntryActionSchema.options[24],
  CLIEntryActionSchema.options[25],
  CLIEntryActionSchema.options[26],
  CLIEntryActionSchema.options[27],
  CLIEntryActionSchema.options[29],
  CLIEntryActionSchema.options[30],
]);
export type RuntimeBackedCLIEntryAction = z.infer<typeof RuntimeBackedCLIEntryActionSchema>;

export function RuntimeBackedCLIEntryOptionsSchema<TPrepared = void>() {
  return z.object({
    action: RuntimeBackedCLIEntryActionSchema,
    createRuntime: createFunctionSchema<(cwd: string) => Promise<CLIAppRuntime>>(),
    streams: PrintStreamsSchema,
    prepare: createFunctionSchema<(
      runtime: CLIAppRuntime,
      cwd: string,
    ) => Promise<TPrepared>>().optional(),
    run: createFunctionSchema<(
      runtime: CLIAppRuntime,
      prepared: TPrepared,
      cwd: string,
    ) => Promise<number>>(),
  });
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

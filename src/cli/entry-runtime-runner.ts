import { resolve } from "node:path";
import type { CLIEntryAction, CLIEntryOutput } from "./entry-args.js";
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
  | "list-agents"
  | "preview-context"
  | "show-history"
  | "list-snapshots"
  | "snapshot-action";

export type RuntimeBackedCLIEntryAction = Extract<CLIEntryAction, { type: RuntimeBackedCLIEntryActionType }>;

export interface RuntimeBackedCLIEntryOptions<TPrepared = void> {
  action: RuntimeBackedCLIEntryAction;
  createRuntime: (cwd: string) => Promise<CLIAppRuntime>;
  streams: PrintStreams;
  prepare?: (runtime: CLIAppRuntime, cwd: string) => Promise<TPrepared>;
  run: (runtime: CLIAppRuntime, prepared: TPrepared, cwd: string) => Promise<number>;
}

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

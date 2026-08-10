import { z } from "zod";
import { resolve } from "node:path";
import { createFunctionSchema, createProtocolSchema } from "../core/index.js";
import { CLIEntryActionSchema } from "./entry-args.js";
import { writeCLIEntryError } from "./entry-fatal.js";
import { loadEntryPrompt } from "./entry-prompt.js";
import { applyCLIEntryRuntimeOptions } from "./entry-runtime-options.js";
import { PrintStreamsSchema, type PrintStreams } from "./print-runner.js";
import type { CLIAppRuntime } from "./runtime/types.js";

export const TUIEntryActionSchema = CLIEntryActionSchema.options[0];
export type TUIEntryAction = z.infer<typeof TUIEntryActionSchema>;

export const TUIRenderHandleSchema = createProtocolSchema({
  unmount: createFunctionSchema<() => void>(),
});
export type TUIRenderHandle = z.infer<typeof TUIRenderHandleSchema>;

export const TUIEntryOptionsSchema = z.object({
  action: TUIEntryActionSchema,
  createRuntime: createFunctionSchema<(cwd: string) => Promise<CLIAppRuntime>>(),
  renderApp: createFunctionSchema<(runtime: CLIAppRuntime) => TUIRenderHandle>(),
  streams: z.lazy(() => PrintStreamsSchema),
  exit: createFunctionSchema<(code: number) => void>(),
  onProcessExit: createFunctionSchema<(listener: () => void) => () => void>(),
  loadPrompt: createFunctionSchema<(
    action: TUIEntryAction,
    cwd: string,
  ) => Promise<string | undefined>>().optional(),
});
export type TUIEntryOptions = z.infer<typeof TUIEntryOptionsSchema>;

function createAltScreenCleanup(streams: PrintStreams): () => void {
  let cleaned = false;
  return () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    streams.stdout("\x1b[?1049l");
  };
}

export async function runTUIEntry(options: TUIEntryOptions): Promise<void> {
  options.streams.stdout("\x1b[?1049h");
  options.streams.stdout("\x1b[2J\x1b[H");

  const cleanup = createAltScreenCleanup(options.streams);
  const removeExitListener = options.onProcessExit(cleanup);
  let runtime: CLIAppRuntime | undefined;
  let renderHandle: TUIRenderHandle | undefined;

  try {
    const cwd = resolve(options.action.cwd ?? process.cwd());
    runtime = await options.createRuntime(cwd);
    await applyCLIEntryRuntimeOptions(runtime, options.action);

    const activeRuntime = runtime;
    renderHandle = options.renderApp(activeRuntime);
    const activeRenderHandle = renderHandle;
    let exitStarted = false;
    activeRuntime.subscribe((event) => {
      if (event.type !== "state" || !event.state.exitRequested || exitStarted) {
        return;
      }
      exitStarted = true;
      activeRenderHandle.unmount();
      void activeRuntime.destroy().finally(() => {
        options.exit(0);
      });
    });

    const prompt = await (options.loadPrompt ?? loadEntryPrompt)(options.action, cwd);
    if (prompt !== undefined) {
      void activeRuntime.submitInput(prompt);
    }
    runtime = undefined;
    renderHandle = undefined;
  } catch (error: unknown) {
    renderHandle?.unmount();
    if (runtime !== undefined) {
      await runtime.destroy();
    }
    cleanup();
    removeExitListener();
    options.exit(writeCLIEntryError(options.streams, error, "text"));
  }
}

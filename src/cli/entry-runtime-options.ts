import type { CLIEntryAction } from "./entry-args.js";
import type { CLIAppRuntime } from "./runtime/types.js";

export async function applyCLIEntryRuntimeOptions(
  runtime: CLIAppRuntime,
  action: Extract<CLIEntryAction, { type: "tui" | "print" }>,
): Promise<void> {
  if (action.autoApprove === true) {
    await runtime.runCommand("auto", "");
  }
  if (action.agent !== undefined) {
    await runtime.runCommand("agent", action.agent);
  }
  if (action.model !== undefined) {
    await runtime.selectModel(action.model);
  }
}

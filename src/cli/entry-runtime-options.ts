import type { CLIEntryAction } from "./entry-args.js";
import type { CLIAppRuntime } from "./runtime/types.js";

export async function applyCLIEntryRuntimeOptions(
  runtime: CLIAppRuntime,
  action: Extract<CLIEntryAction, { type: "tui" | "print" | "doctor" | "list-tools" | "list-agents" | "preview-context" | "show-history" }>,
): Promise<void> {
  if (action.sessionId !== undefined) {
    await runtime.switchSession(action.sessionId);
  }
  if (action.newSession !== undefined) {
    await runtime.createSession(action.newSession);
  }
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

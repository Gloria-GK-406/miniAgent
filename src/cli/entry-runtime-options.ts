import type { CLIEntryAction } from "./entry-args.js";
import type { CLIAppRuntime } from "./runtime/types.js";

export async function applyCLIEntryRuntimeOptions(
  runtime: CLIAppRuntime,
  action: Extract<CLIEntryAction, { type: "tui" | "print" | "doctor" | "status" | "overview" | "list-tools" | "list-todos" | "list-agents" | "preview-context" | "show-history" | "list-snapshots" | "snapshot-action" }>,
): Promise<void> {
  if (action.sessionId !== undefined) {
    await runtime.switchSession(action.sessionId);
  }
  if ("newSession" in action && action.newSession !== undefined) {
    await runtime.createSession(action.newSession);
  }
  if ("autoApprove" in action && action.autoApprove === true) {
    await runtime.runCommand("auto", "");
  }
  if ("agent" in action && action.agent !== undefined) {
    await runtime.runCommand("agent", action.agent);
  }
  if ("model" in action && action.model !== undefined) {
    await runtime.selectModel(action.model);
  }
}

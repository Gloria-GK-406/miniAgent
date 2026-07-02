import type { CLIDoctorCheck } from "./runtime/doctor-service.js";
import type { CLIAppRuntime } from "./runtime/types.js";
import type { PrintStreams } from "./print-runner.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatDoctorChecks(checks: CLIDoctorCheck[]): string {
  return checks
    .map((check) => `${check.status.toUpperCase()} ${check.label} - ${check.detail}`)
    .join("\n")
    .concat("\n");
}

export async function runDoctorChecks(
  runtime: CLIAppRuntime,
  streams: PrintStreams,
): Promise<number> {
  try {
    await runtime.runDoctor();
    const panel = runtime.getState().panel;
    if (panel.type !== "doctor") {
      streams.stderr("Doctor did not produce results\n");
      return 1;
    }
    streams.stdout(formatDoctorChecks(panel.checks));
    return panel.checks.some((check) => check.status === "fail") ? 1 : 0;
  } catch (error: unknown) {
    streams.stderr(`${errorMessage(error)}\n`);
    return 1;
  } finally {
    await runtime.destroy();
  }
}

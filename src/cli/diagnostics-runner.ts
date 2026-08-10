import { z } from "zod";
import { createFunctionSchema, createProtocolSchema } from "../core/index.js";
import { ConfigTemplateCreatedError, loadConfig } from "./config.js";
import { writeCLIEntryConfigTemplateCreated } from "./entry-fatal.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";
import { createDiagnosticsService, type DiagnosticResult, type DiagnosticsService } from "./runtime/diagnostics-service.js";
import { createShellService } from "./runtime/shell-service.js";

export const DiagnosticsOutputSchema = z.enum(["text", "json"]);
export type DiagnosticsOutput = z.infer<typeof DiagnosticsOutputSchema>;

export const HeadlessDiagnosticsRequestSchema = z.object({
  baseDir: z.string(),
  output: DiagnosticsOutputSchema.optional(),
});
export type HeadlessDiagnosticsRequest = z.infer<typeof HeadlessDiagnosticsRequestSchema>;

export const HeadlessDiagnosticsDepsSchema = createProtocolSchema({
  runDiagnostics: createFunctionSchema<DiagnosticsService["runDiagnostics"]>(),
});
export type HeadlessDiagnosticsDeps = z.infer<typeof HeadlessDiagnosticsDepsSchema>;

function diagnosticPassed(result: DiagnosticResult): boolean {
  return result.exitCode === 0 && !result.timedOut && !result.aborted;
}

function summarizeDiagnosticOutput(result: DiagnosticResult): string {
  const output = result.stdout.trim().length > 0 ? result.stdout : result.stderr;
  const firstLine = output.trim().split(/\r?\n/)[0];
  return firstLine !== undefined && firstLine.length > 0 ? firstLine : "(no output)";
}

async function createDefaultDiagnosticsService(baseDir: string): Promise<DiagnosticsService> {
  const config = await loadConfig(baseDir);
  return createDiagnosticsService({
    baseDir,
    config: config.diagnostics,
    shellService: createShellService(config.shell),
  });
}

export function formatDiagnosticsText(results: DiagnosticResult[]): string {
  if (results.length === 0) {
    return "No diagnostics configured\n";
  }

  return results
    .map((result) => {
      const status = diagnosticPassed(result) ? "PASS" : "FAIL";
      return `${status} ${result.command} - ${summarizeDiagnosticOutput(result)}`;
    })
    .join("\n")
    .concat("\n");
}

export function formatDiagnosticsJson(results: DiagnosticResult[]): string {
  return `${JSON.stringify({
    ok: results.every(diagnosticPassed),
    results,
  }, null, 2)}\n`;
}

export async function runHeadlessDiagnostics(
  request: HeadlessDiagnosticsRequest,
  streams: PrintStreams,
  deps?: HeadlessDiagnosticsDeps,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const service = deps ?? await createDefaultDiagnosticsService(request.baseDir);
    const results = await service.runDiagnostics();
    streams.stdout(
      output === "json"
        ? formatDiagnosticsJson(results)
        : formatDiagnosticsText(results),
    );
    return results.every(diagnosticPassed) ? 0 : 1;
  } catch (error: unknown) {
    if (error instanceof ConfigTemplateCreatedError) {
      writeCLIEntryConfigTemplateCreated(streams, error.configPath, output);
      return 0;
    }
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

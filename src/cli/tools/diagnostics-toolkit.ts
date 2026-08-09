import { z } from "zod";
import type { Tool } from "../../core/index.js";
import type { DiagnosticResult, DiagnosticsService } from "../runtime/diagnostics-service.js";
import type { PermissionService } from "../runtime/permission-service.js";

const EmptyParamsSchema = z.object({}).strict();

export interface DiagnosticsToolkitOptions {
  diagnosticsService: DiagnosticsService;
  permissionService: PermissionService;
  getAutoApprove: () => boolean;
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}

export interface DiagnosticsToolkit {
  tools: Tool[];
}

async function assertPermission(
  options: DiagnosticsToolkitOptions,
  args: Record<string, unknown>,
): Promise<void> {
  const result = options.permissionService.resolve({ toolName: "diagnostics", args }, options.getAutoApprove());
  if (result.decision === "deny") {
    throw new Error(`Permission denied for diagnostics: ${result.reason}`);
  }
  if (result.decision === "ask" && !(await options.requestApproval("diagnostics", args))) {
    throw new Error("Permission rejected for diagnostics");
  }
}

function diagnosticPassed(result: DiagnosticResult): boolean {
  return result.exitCode === 0 && !result.timedOut && !result.aborted;
}

function summarizeDiagnosticOutput(result: DiagnosticResult): string {
  const output = result.stdout.trim().length > 0 ? result.stdout : result.stderr;
  const firstLine = output.trim().split(/\r?\n/)[0];
  return firstLine !== undefined && firstLine.length > 0 ? firstLine : "(no output)";
}

export function formatDiagnosticsToolResult(results: DiagnosticResult[]): string {
  if (results.length === 0) {
    return "No diagnostics configured";
  }

  const status = results.every(diagnosticPassed) ? "PASS" : "FAIL";
  return [
    `${status} diagnostics`,
    ...results.map((result) =>
      `${diagnosticPassed(result) ? "PASS" : "FAIL"} ${result.command} - ${summarizeDiagnosticOutput(result)}`),
  ].join("\n");
}

export function createDiagnosticsToolkit(options: DiagnosticsToolkitOptions): DiagnosticsToolkit {
  return {
    tools: [
      {
        name: "diagnostics",
        description: "Run configured or discovered project diagnostics.",
        parameters: EmptyParamsSchema,
        execute: async (args): Promise<string> => {
          const parsed = EmptyParamsSchema.parse(args);
          await assertPermission(options, parsed);
          return formatDiagnosticsToolResult(await options.diagnosticsService.runDiagnostics());
        },
      },
    ],
  };
}

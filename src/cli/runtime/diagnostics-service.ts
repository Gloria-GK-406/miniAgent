import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CLIDiagnosticsConfigSchema, type CLIDiagnosticsConfig } from "../config.js";
import { ShellServiceSchema, ShellExecuteResultSchema, type ShellExecuteResult, type ShellService } from "./shell-service.js";

export const DiagnosticResultSchema = z.intersection(z.lazy(() => ShellExecuteResultSchema), z.object({
  command: z.string(),
})) as z.ZodType<ShellExecuteResult & {
  command: string;
}>;
export type DiagnosticResult = z.infer<typeof DiagnosticResultSchema>;

export const DiagnosticsServiceSchema = z.custom<{
  discoverCommands(): Promise<string[]>;
  runDiagnostics(): Promise<DiagnosticResult[]>;
}>();
export type DiagnosticsService = z.infer<typeof DiagnosticsServiceSchema>;

export const CreateDiagnosticsServiceOptionsSchema = z.object({
  baseDir: z.string(),
  config: CLIDiagnosticsConfigSchema.removeDefault().partial(),
  shellService: z.lazy(() => ShellServiceSchema),
}) as z.ZodType<{
  baseDir: string;
  config: Partial<CLIDiagnosticsConfig>;
  shellService: ShellService;
}>;
export type CreateDiagnosticsServiceOptions = z.infer<typeof CreateDiagnosticsServiceOptionsSchema>;

function hasScript(scripts: Record<string, unknown>, name: string): boolean {
  return typeof scripts[name] === "string";
}

async function readPackageScripts(baseDir: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(join(baseDir, "package.json"), "utf-8");
    const parsed = JSON.parse(content) as { scripts?: unknown };
    if (parsed.scripts !== null && typeof parsed.scripts === "object" && !Array.isArray(parsed.scripts)) {
      return parsed.scripts as Record<string, unknown>;
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  return {};
}

export function createDiagnosticsService(options: CreateDiagnosticsServiceOptions): DiagnosticsService {
  async function discoverCommands(): Promise<string[]> {
    const configured = options.config.commands?.map((command) => command.trim()).filter(Boolean);
    if (configured !== undefined && configured.length > 0) {
      return configured;
    }

    const scripts = await readPackageScripts(options.baseDir);
    const commands: string[] = [];
    if (hasScript(scripts, "typecheck")) commands.push("npm run typecheck");
    if (hasScript(scripts, "lint")) commands.push("npm run lint");
    if (hasScript(scripts, "test")) commands.push("npm test");
    return commands;
  }

  return {
    discoverCommands,
    runDiagnostics: async () => {
      const commands = await discoverCommands();
      const results: DiagnosticResult[] = [];
      for (const command of commands) {
        const result = await options.shellService.execute({
          command,
          cwd: options.baseDir,
          ...(options.config.timeoutMs !== undefined && { timeoutMs: options.config.timeoutMs }),
        });
        results.push({ command, ...result });
      }
      return results;
    },
  };
}

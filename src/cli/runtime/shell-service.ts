import { z } from "zod";
import { spawn } from "node:child_process";
import type { CLIShellConfig } from "../config.js";

export const ShellInvocationSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
}) as z.ZodType<{
  command: string;
  args: string[];
}>;
export type ShellInvocation = z.infer<typeof ShellInvocationSchema>;

export const ShellExecuteRequestSchema = z.object({
  command: z.string(),
  cwd: z.string().optional(),
  signal: z.custom<AbortSignal>().optional(),
  timeoutMs: z.number().optional(),
}) as z.ZodType<{
  command: string;
  cwd?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}>;
export type ShellExecuteRequest = z.infer<typeof ShellExecuteRequestSchema>;

export const ShellExecuteResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.union([z.number(), z.null()]),
  timedOut: z.boolean(),
  aborted: z.boolean(),
}) as z.ZodType<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
}>;
export type ShellExecuteResult = z.infer<typeof ShellExecuteResultSchema>;

export const ShellServiceSchema = z.custom<{
  execute(request: ShellExecuteRequest): Promise<ShellExecuteResult>;
}>();
export type ShellService = z.infer<typeof ShellServiceSchema>;

export function buildShellInvocation(
  commandText: string,
  config: CLIShellConfig,
  platform: NodeJS.Platform = process.platform,
): ShellInvocation {
  if (config.executable !== undefined) {
    return {
      command: config.executable,
      args: [...(config.args ?? []), commandText],
    };
  }

  if (platform === "win32") {
    switch (config.windows) {
      case "powershell":
        return {
          command: "powershell.exe",
          args: ["-NoLogo", "-NoProfile", "-Command", commandText],
        };
      case "cmd":
        return { command: "cmd.exe", args: ["/d", "/s", "/c", commandText] };
      case "wsl":
        return { command: "wsl.exe", args: ["sh", "-lc", commandText] };
      case "git-bash":
        return { command: "bash.exe", args: ["-lc", commandText] };
    }
  }

  return { command: "/bin/sh", args: ["-c", commandText] };
}

export function createShellService(config: CLIShellConfig): ShellService {
  return {
    execute: async (request): Promise<ShellExecuteResult> => {
      const invocation = buildShellInvocation(request.command, config);
      const timeoutMs = request.timeoutMs ?? config.timeoutMs;

      return await new Promise<ShellExecuteResult>((resolve) => {
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let aborted = request.signal?.aborted ?? false;
        let settled = false;

        const child = spawn(invocation.command, invocation.args, {
          ...(request.cwd !== undefined && { cwd: request.cwd }),
          windowsHide: true,
        });

        const cleanup = (): void => {
          clearTimeout(timeout);
          request.signal?.removeEventListener("abort", abort);
        };

        const settle = (result: ShellExecuteResult): void => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve(result);
        };

        const abort = (): void => {
          aborted = true;
          child.kill();
        };

        const timeout = setTimeout(() => {
          timedOut = true;
          child.kill();
        }, timeoutMs);

        if (aborted) {
          abort();
        } else {
          request.signal?.addEventListener("abort", abort, { once: true });
        }

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });
        child.on("error", (error) => {
          settle({
            stdout,
            stderr: stderr.length > 0 ? `${stderr}\n${error.message}` : error.message,
            exitCode: null,
            timedOut,
            aborted,
          });
        });
        child.on("close", (code) => {
          settle({ stdout, stderr, exitCode: code, timedOut, aborted });
        });
      });
    },
  };
}

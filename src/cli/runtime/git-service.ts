import { z } from "zod";
import { spawn } from "node:child_process";
import { relative } from "node:path";
import { resolveWorkspacePath } from "../tools/workspace.js";

export const GitDiffOptionsSchema = z.object({
  staged: z.boolean().optional(),
  path: z.string().optional(),
}) as z.ZodType<{
  staged?: boolean;
  path?: string;
}>;
export type GitDiffOptions = z.infer<typeof GitDiffOptionsSchema>;

export const GitLogOptionsSchema = z.object({
  limit: z.number().optional(),
}) as z.ZodType<{
  limit?: number;
}>;
export type GitLogOptions = z.infer<typeof GitLogOptionsSchema>;

export const GitServiceSchema = z.custom<{
  isRepository(): Promise<boolean>;
  statusShort(): Promise<string>;
  diff(options?: GitDiffOptions): Promise<string>;
  log(options?: GitLogOptions): Promise<string>;
  branchName(): Promise<string>;
  commit(message: string): Promise<string>;
}>();
export type GitService = z.infer<typeof GitServiceSchema>;

interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function runGit(baseDir: string, args: string[]): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: baseDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      const result = { stdout, stderr, exitCode };
      if (exitCode !== 0) {
        reject(new Error((stderr || stdout || `git ${args.join(" ")} failed`).trim()));
        return;
      }
      resolve(result);
    });
  });
}

function workspaceRelativePath(baseDir: string, path: string): string {
  const resolved = resolveWorkspacePath(baseDir, path);
  return relative(baseDir, resolved.absolutePath).replaceAll("\\", "/");
}

export function createGitService(baseDir: string): GitService {
  return {
    isRepository: async () => {
      try {
        await runGit(baseDir, ["rev-parse", "--is-inside-work-tree"]);
        return true;
      } catch {
        return false;
      }
    },
    statusShort: async () => {
      return (await runGit(baseDir, ["status", "--short"])).stdout;
    },
    diff: async (options = {}) => {
      const args = ["diff"];
      if (options.staged === true) {
        args.push("--staged");
      }
      if (options.path !== undefined) {
        args.push("--", workspaceRelativePath(baseDir, options.path));
      }
      return (await runGit(baseDir, args)).stdout;
    },
    log: async (options = {}) => {
      const limit = options.limit ?? 10;
      return (await runGit(baseDir, [
        "log",
        `--max-count=${limit}`,
        "--pretty=format:%h %s",
      ])).stdout;
    },
    branchName: async () => {
      return (await runGit(baseDir, ["branch", "--show-current"])).stdout.trim();
    },
    commit: async (message) => {
      const trimmed = message.trim();
      if (trimmed.length === 0) {
        throw new Error("Commit message cannot be empty");
      }
      return (await runGit(baseDir, ["commit", "-m", trimmed])).stdout;
    },
  };
}

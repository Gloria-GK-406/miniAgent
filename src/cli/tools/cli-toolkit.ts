import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { Tool } from "../../tool/types.js";
import type { PermissionService } from "../runtime/permission-service.js";
import type { ShellService } from "../runtime/shell-service.js";
import type { SnapshotService } from "../runtime/snapshot-service.js";
import { resolveWorkspacePath } from "./workspace.js";

const PathParamsSchema = z.object({
  path: z.string().min(1),
});

const ReadParamsSchema = PathParamsSchema.extend({
  offset: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
});

const WriteParamsSchema = PathParamsSchema.extend({
  content: z.string(),
});

const EditParamsSchema = PathParamsSchema.extend({
  oldString: z.string().min(1),
  newString: z.string(),
  replaceAll: z.boolean().optional(),
});

const ShellParamsSchema = z.object({
  command: z.string().min(1),
  timeoutMs: z.number().int().positive().optional(),
});

export interface CLIToolkitOptions {
  baseDir: string;
  permissionService: PermissionService;
  getAutoApprove: () => boolean;
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  shellService: ShellService;
  snapshotService?: SnapshotService;
}

export interface CLIToolkit {
  tools: Tool[];
}

async function assertPermission(
  options: CLIToolkitOptions,
  toolName: string,
  args: Record<string, unknown>,
): Promise<void> {
  const result = options.permissionService.resolve({ toolName, args }, options.getAutoApprove());
  if (result.decision === "deny") {
    throw new Error(`Permission denied for ${toolName}: ${result.reason}`);
  }
  if (result.decision === "ask" && !(await options.requestApproval(toolName, args))) {
    throw new Error(`Permission rejected for ${toolName}`);
  }
}

async function mutateWithSnapshot(
  options: CLIToolkitOptions,
  path: string,
  mutate: () => Promise<void>,
): Promise<void> {
  if (options.snapshotService === undefined) {
    await mutate();
    return;
  }
  await options.snapshotService.recordBeforeMutation(path, mutate);
}

function createReadTool(options: CLIToolkitOptions): Tool {
  return {
    name: "read",
    description: "Read a workspace file or directory with optional line range.",
    parameters: ReadParamsSchema,
    execute: async (args): Promise<string> => {
      await assertPermission(options, "read", args);
      const parsed = ReadParamsSchema.parse(args);
      const target = resolveWorkspacePath(options.baseDir, parsed.path);
      const info = await stat(target.absolutePath);
      if (info.isDirectory()) {
        return (await readdir(target.absolutePath)).join("\n");
      }
      const content = await readFile(target.absolutePath, "utf-8");
      if (parsed.offset === undefined && parsed.limit === undefined) {
        return content;
      }
      const lines = content.split("\n");
      const start = (parsed.offset ?? 1) - 1;
      const end = parsed.limit === undefined ? lines.length : start + parsed.limit;
      return lines.slice(start, end).join("\n");
    },
  };
}

function createWriteTool(options: CLIToolkitOptions): Tool {
  return {
    name: "write",
    description: "Write a workspace file, creating parent directories.",
    parameters: WriteParamsSchema,
    execute: async (args): Promise<string> => {
      await assertPermission(options, "write", args);
      const parsed = WriteParamsSchema.parse(args);
      const target = resolveWorkspacePath(options.baseDir, parsed.path);
      await mutateWithSnapshot(options, parsed.path, async () => {
        await mkdir(dirname(target.absolutePath), { recursive: true });
        await writeFile(target.absolutePath, parsed.content, "utf-8");
      });
      return `Wrote ${target.displayPath}`;
    },
  };
}

function createEditTool(options: CLIToolkitOptions): Tool {
  return {
    name: "edit",
    description: "Edit a workspace file by exact string replacement.",
    parameters: EditParamsSchema,
    execute: async (args): Promise<string> => {
      await assertPermission(options, "edit", args);
      const parsed = EditParamsSchema.parse(args);
      const target = resolveWorkspacePath(options.baseDir, parsed.path);
      const content = await readFile(target.absolutePath, "utf-8");
      const count = content.split(parsed.oldString).length - 1;
      if (count === 0) {
        throw new Error(`oldString not found in ${target.displayPath}`);
      }
      if (count > 1 && parsed.replaceAll !== true) {
        throw new Error(`oldString found ${count} times in ${target.displayPath}`);
      }
      const next = parsed.replaceAll === true
        ? content.replaceAll(parsed.oldString, parsed.newString)
        : content.replace(parsed.oldString, parsed.newString);
      await mutateWithSnapshot(options, parsed.path, async () => {
        await writeFile(target.absolutePath, next, "utf-8");
      });
      return `Edited ${target.displayPath}`;
    },
  };
}

function createShellTool(options: CLIToolkitOptions): Tool {
  return {
    name: "shell",
    description: "Execute a shell command in the workspace.",
    parameters: ShellParamsSchema,
    execute: async (args, signal): Promise<string> => {
      await assertPermission(options, "shell", args);
      const parsed = ShellParamsSchema.parse(args);
      const result = await options.shellService.execute({
        command: parsed.command,
        cwd: options.baseDir,
        ...(signal !== undefined && { signal }),
        ...(parsed.timeoutMs !== undefined && { timeoutMs: parsed.timeoutMs }),
      });
      const output = [result.stdout, result.stderr]
        .filter((part) => part.trim().length > 0)
        .join("\n");
      const suffix = result.timedOut
        ? "\n[Timed out]"
        : result.aborted
          ? "\n[Aborted]"
          : result.exitCode !== 0
            ? `\n[Exit code: ${result.exitCode}]`
            : "";
      return `${output || "[No output]"}${suffix}`;
    },
  };
}

export function createCLIToolkit(options: CLIToolkitOptions): CLIToolkit {
  return {
    tools: [
      createReadTool(options),
      createWriteTool(options),
      createEditTool(options),
      createShellTool(options),
    ],
  };
}

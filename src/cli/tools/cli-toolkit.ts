import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { z } from "zod";
import { ToolSchema, type Tool } from "../../core/index.js";
import type { PermissionService } from "../runtime/permission-service.js";
import type { ShellService } from "../runtime/shell-service.js";
import type { SnapshotService } from "../runtime/snapshot-service.js";
import { resolveWorkspacePath } from "./workspace.js";

const PathParamsSchema = z.object({
  path: z.string().min(1),
});

const ReadParamsSchema = PathParamsSchema.extend({
  offset: z.int().positive().optional(),
  limit: z.int().positive().optional(),
});

const GlobParamsSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().min(1).optional(),
});

const GrepParamsSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().min(1).optional(),
  include: z.string().min(1).optional(),
});

const WriteParamsSchema = PathParamsSchema.extend({
  content: z.string(),
});

const MoveParamsSchema = z.object({
  source: z.string().min(1),
  destination: z.string().min(1),
});

const EditParamsSchema = PathParamsSchema.extend({
  oldString: z.string().min(1),
  newString: z.string(),
  replaceAll: z.boolean().optional(),
});

const MultiEditParamsSchema = PathParamsSchema.extend({
  edits: z.array(z.object({
    oldString: z.string().min(1),
    newString: z.string(),
  })).min(1),
});

const PatchParamsSchema = z.object({
  patch: z.string().min(1),
});

const ShellParamsSchema = z.object({
  command: z.string().min(1),
  timeoutMs: z.int().positive().optional(),
});

const SEARCH_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
]);

export const CLIToolkitOptionsSchema = z.custom<{
  baseDir: string;
  permissionService: PermissionService;
  getAutoApprove: () => boolean;
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  shellService: ShellService;
  snapshotService?: SnapshotService;
  onWorkspaceFilesChanged?: () => Promise<void>;
}>();
export type CLIToolkitOptions = z.infer<typeof CLIToolkitOptionsSchema>;

export const CLIToolkitSchema = z.object({
  tools: z.array(z.lazy(() => ToolSchema)),
}) as z.ZodType<{
  tools: Tool[];
}>;
export type CLIToolkit = z.infer<typeof CLIToolkitSchema>;

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
  notify = true,
): Promise<void> {
  if (options.snapshotService === undefined) {
    await mutate();
    if (notify) {
      await options.onWorkspaceFilesChanged?.();
    }
    return;
  }
  await options.snapshotService.recordBeforeMutation(path, mutate);
  if (notify) {
    await options.onWorkspaceFilesChanged?.();
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function countOccurrences(content: string, needle: string): number {
  return content.split(needle).length - 1;
}

function toPosixPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function matchGlob(pattern: string, path: string): boolean {
  return matchGlobParts(pattern.split("/"), 0, path.split("/"), 0);
}

function matchGlobParts(
  patternParts: string[],
  patternIndex: number,
  pathParts: string[],
  pathIndex: number,
): boolean {
  if (patternIndex === patternParts.length && pathIndex === pathParts.length) {
    return true;
  }
  if (patternIndex === patternParts.length) {
    return false;
  }
  const part = patternParts[patternIndex]!;
  if (part === "**") {
    const nextPatternIndex = patternIndex + 1;
    if (nextPatternIndex === patternParts.length) {
      return true;
    }
    for (let nextPathIndex = pathIndex; nextPathIndex <= pathParts.length; nextPathIndex++) {
      if (matchGlobParts(patternParts, nextPatternIndex, pathParts, nextPathIndex)) {
        return true;
      }
    }
    return false;
  }
  if (pathIndex === pathParts.length) {
    return false;
  }
  if (!matchGlobSegment(part, pathParts[pathIndex]!)) {
    return false;
  }
  return matchGlobParts(patternParts, patternIndex + 1, pathParts, pathIndex + 1);
}

function matchGlobSegment(pattern: string, segment: string): boolean {
  const regex = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", "[^/]*")
    .replaceAll("?", "[^/]") + "$";
  return new RegExp(regex).test(segment);
}

interface SearchFile {
  absolutePath: string;
  displayPath: string;
  matchPath: string;
}

async function collectSearchFiles(
  baseDir: string,
  inputPath: string,
): Promise<SearchFile[]> {
  const target = resolveWorkspacePath(baseDir, inputPath);
  const info = await stat(target.absolutePath);
  if (!info.isDirectory()) {
    return [{
      absolutePath: target.absolutePath,
      displayPath: target.displayPath,
      matchPath: basename(target.displayPath),
    }];
  }

  const files: SearchFile[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && SEARCH_IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      const absolutePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const displayPath = resolveWorkspacePath(baseDir, absolutePath).displayPath;
      files.push({
        absolutePath,
        displayPath,
        matchPath: toPosixPath(relative(target.absolutePath, absolutePath)),
      });
    }
  }
  await walk(target.absolutePath);
  return files.sort((left, right) => left.displayPath.localeCompare(right.displayPath));
}

function matchesInclude(include: string, file: SearchFile): boolean {
  const normalized = toPosixPath(include);
  if (normalized.includes("/")) {
    return matchGlob(normalized, file.matchPath);
  }
  return matchGlobSegment(normalized, basename(file.displayPath));
}

function stripPatchPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.startsWith("a/") || trimmed.startsWith("b/")) {
    return trimmed.slice(2);
  }
  return trimmed;
}

interface ParsedPatch {
  operation: "modify" | "create" | "delete";
  path: string;
  hunks: Array<{
    oldText: string;
    newText: string;
  }>;
}

function parseUnifiedPatch(patch: string): ParsedPatch {
  const lines = patch.split(/\r?\n/);
  const oldPathLine = lines.find((line) => line.startsWith("--- "));
  const newPathLine = lines.find((line) => line.startsWith("+++ "));
  if (oldPathLine === undefined || newPathLine === undefined) {
    throw new Error("Patch must include --- and +++ file headers");
  }
  const oldPath = stripPatchPath(oldPathLine.slice(4));
  const newPath = stripPatchPath(newPathLine.slice(4));
  let operation: ParsedPatch["operation"] = "modify";
  let path = newPath;
  if (oldPath === "/dev/null") {
    operation = "create";
  } else if (newPath === "/dev/null") {
    operation = "delete";
    path = oldPath;
  } else if (oldPath !== newPath) {
    throw new Error("Patch tool only supports single-file patches");
  } else {
    path = newPath;
  }
  if (path === "/dev/null") {
    throw new Error("Patch target is missing");
  }

  const hunks: ParsedPatch["hunks"] = [];
  let index = lines.findIndex((line) => line.startsWith("@@ "));
  while (index !== -1) {
    index++;
    const oldLines: string[] = [];
    const newLines: string[] = [];
    while (index < lines.length && !lines[index]!.startsWith("@@ ")) {
      const line = lines[index]!;
      if (line.startsWith(" ")) {
        oldLines.push(line.slice(1));
        newLines.push(line.slice(1));
      } else if (line.startsWith("-")) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith("+")) {
        newLines.push(line.slice(1));
      } else if (line === "\\ No newline at end of file" || line === "") {
        // Ignore metadata and trailing split lines.
      } else {
        throw new Error(`Unsupported patch line: ${line}`);
      }
      index++;
    }
    hunks.push({
      oldText: oldLines.join("\n"),
      newText: newLines.join("\n"),
    });
    const next = lines.findIndex((line, lineIndex) => lineIndex >= index && line.startsWith("@@ "));
    index = next;
  }

  if (hunks.length === 0) {
    throw new Error("Patch must include at least one hunk");
  }
  return { operation, path, hunks };
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

function createGlobTool(options: CLIToolkitOptions): Tool {
  return {
    name: "glob",
    description: "Find workspace files matching a glob pattern.",
    parameters: GlobParamsSchema,
    execute: async (args): Promise<string> => {
      await assertPermission(options, "glob", args);
      const parsed = GlobParamsSchema.parse(args);
      const files = await collectSearchFiles(options.baseDir, parsed.path ?? ".");
      const matched = files
        .filter((file) => matchGlob(parsed.pattern, file.matchPath))
        .map((file) => file.displayPath);
      return matched.length === 0 ? "No files matched the pattern." : matched.join("\n");
    },
  };
}

function createGrepTool(options: CLIToolkitOptions): Tool {
  return {
    name: "grep",
    description: "Search workspace file contents using a regular expression.",
    parameters: GrepParamsSchema,
    execute: async (args): Promise<string> => {
      await assertPermission(options, "grep", args);
      const parsed = GrepParamsSchema.parse(args);
      const regex = new RegExp(parsed.pattern);
      const files = await collectSearchFiles(options.baseDir, parsed.path ?? ".");
      const filtered = parsed.include === undefined
        ? files
        : files.filter((file) => matchesInclude(parsed.include!, file));
      const lines: string[] = [];
      for (const file of filtered) {
        let content: string;
        try {
          content = await readFile(file.absolutePath, "utf-8");
        } catch {
          continue;
        }
        const fileLines = content.split("\n");
        for (let index = 0; index < fileLines.length; index++) {
          if (regex.test(fileLines[index]!)) {
            lines.push(`${file.displayPath}:${index + 1}: ${fileLines[index]!}`);
          }
        }
      }
      return lines.length === 0 ? "No matches found." : lines.join("\n");
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

function createDeleteTool(options: CLIToolkitOptions): Tool {
  return {
    name: "delete",
    description: "Delete a workspace file.",
    parameters: PathParamsSchema,
    execute: async (args): Promise<string> => {
      await assertPermission(options, "delete", args);
      const parsed = PathParamsSchema.parse(args);
      const target = resolveWorkspacePath(options.baseDir, parsed.path);
      const info = await stat(target.absolutePath);
      if (info.isDirectory()) {
        throw new Error(`Cannot delete directory ${target.displayPath}`);
      }
      await mutateWithSnapshot(options, parsed.path, async () => {
        await unlink(target.absolutePath);
      });
      return `Deleted ${target.displayPath}`;
    },
  };
}

function createMoveTool(options: CLIToolkitOptions): Tool {
  return {
    name: "move",
    description: "Move or rename a workspace file without overwriting the destination.",
    parameters: MoveParamsSchema,
    execute: async (args): Promise<string> => {
      await assertPermission(options, "move", args);
      const parsed = MoveParamsSchema.parse(args);
      const source = resolveWorkspacePath(options.baseDir, parsed.source);
      const destination = resolveWorkspacePath(options.baseDir, parsed.destination);
      const info = await stat(source.absolutePath);
      if (info.isDirectory()) {
        throw new Error(`Cannot move directory ${source.displayPath}`);
      }
      if (await pathExists(destination.absolutePath)) {
        throw new Error(`Destination already exists: ${destination.displayPath}`);
      }

      await mutateWithSnapshot(options, parsed.source, async () => {
        await mutateWithSnapshot(options, parsed.destination, async () => {
          await mkdir(dirname(destination.absolutePath), { recursive: true });
          await rename(source.absolutePath, destination.absolutePath);
        }, false);
      }, false);
      await options.onWorkspaceFilesChanged?.();
      return `Moved ${source.displayPath} to ${destination.displayPath}`;
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

function createMultiEditTool(options: CLIToolkitOptions): Tool {
  return {
    name: "multi_edit",
    description: "Apply multiple exact replacements to one workspace file atomically.",
    parameters: MultiEditParamsSchema,
    execute: async (args): Promise<string> => {
      await assertPermission(options, "multi_edit", args);
      const parsed = MultiEditParamsSchema.parse(args);
      const target = resolveWorkspacePath(options.baseDir, parsed.path);
      const content = await readFile(target.absolutePath, "utf-8");
      let next = content;
      for (const edit of parsed.edits) {
        const count = countOccurrences(next, edit.oldString);
        if (count === 0) {
          throw new Error(`oldString not found in ${target.displayPath}`);
        }
        if (count > 1) {
          throw new Error(`oldString found ${count} times in ${target.displayPath}`);
        }
        next = next.replace(edit.oldString, edit.newString);
      }
      await mutateWithSnapshot(options, parsed.path, async () => {
        await writeFile(target.absolutePath, next, "utf-8");
      });
      return `Edited ${target.displayPath}`;
    },
  };
}

function createPatchTool(options: CLIToolkitOptions): Tool {
  return {
    name: "patch",
    description: "Apply a conservative single-file unified patch.",
    parameters: PatchParamsSchema,
    execute: async (args): Promise<string> => {
      await assertPermission(options, "patch", args);
      const parsed = PatchParamsSchema.parse(args);
      const patch = parseUnifiedPatch(parsed.patch);
      const target = resolveWorkspacePath(options.baseDir, patch.path);
      if (patch.operation === "create") {
        if (await pathExists(target.absolutePath)) {
          throw new Error(`Patch target already exists: ${target.displayPath}`);
        }
        const content = patch.hunks.map((hunk) => hunk.newText).join("\n");
        await mutateWithSnapshot(options, patch.path, async () => {
          await mkdir(dirname(target.absolutePath), { recursive: true });
          await writeFile(target.absolutePath, content, "utf-8");
        });
        return `Created ${target.displayPath}`;
      }
      let content = await readFile(target.absolutePath, "utf-8");
      if (patch.operation === "delete") {
        for (const hunk of patch.hunks) {
          const count = countOccurrences(content, hunk.oldText);
          if (count === 0) {
            throw new Error(`Patch hunk not found in ${target.displayPath}`);
          }
          if (count > 1) {
            throw new Error(`Patch hunk is ambiguous in ${target.displayPath}`);
          }
        }
        await mutateWithSnapshot(options, patch.path, async () => {
          await unlink(target.absolutePath);
        });
        return `Deleted ${target.displayPath}`;
      }
      for (const hunk of patch.hunks) {
        const count = countOccurrences(content, hunk.oldText);
        if (count === 0) {
          throw new Error(`Patch hunk not found in ${target.displayPath}`);
        }
        if (count > 1) {
          throw new Error(`Patch hunk is ambiguous in ${target.displayPath}`);
        }
        content = content.replace(hunk.oldText, hunk.newText);
      }
      await mutateWithSnapshot(options, patch.path, async () => {
        await writeFile(target.absolutePath, content, "utf-8");
      });
      return `Patched ${target.displayPath}`;
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
      createGlobTool(options),
      createGrepTool(options),
      createWriteTool(options),
      createDeleteTool(options),
      createMoveTool(options),
      createEditTool(options),
      createMultiEditTool(options),
      createPatchTool(options),
      createShellTool(options),
    ],
  };
}

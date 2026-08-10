import { z } from "zod";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  CLIEditorConfigSchema,
  NodePlatformSchema,
  type CLIEditorConfig,
} from "../config.js";

export const EditorInvocationSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  filePath: z.string(),
}) as z.ZodType<{
  command: string;
  args: string[];
  filePath: string;
}>;
export type EditorInvocation = z.infer<typeof EditorInvocationSchema>;

export const EditorServiceSchema = z.custom<{
  openEditor(initialContent: string): Promise<string>;
}>();
export type EditorService = z.infer<typeof EditorServiceSchema>;

export const ResolveEditorInvocationOptionsSchema = z.object({
  config: z.lazy(() => CLIEditorConfigSchema),
  env: z.record(z.string(), z.union([z.string(), z.undefined()])),
  platform: NodePlatformSchema,
  filePath: z.string(),
}) as z.ZodType<{
  config: CLIEditorConfig;
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  filePath: string;
}>;
export type ResolveEditorInvocationOptions = z.infer<typeof ResolveEditorInvocationOptionsSchema>;

export const CreateEditorServiceOptionsSchema = z.custom<{
  config: CLIEditorConfig;
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  tempRoot?: string;
  runner?: (invocation: EditorInvocation) => Promise<void>;
}>();
export type CreateEditorServiceOptions = z.infer<typeof CreateEditorServiceOptionsSchema>;

function splitCommandLine(value: string): string[] {
  return Array.from(value.matchAll(/"([^"]*)"|'([^']*)'|[^\s]+/g), (match) => (
    match[1] ?? match[2] ?? match[0]
  ));
}

function appendDraftPath(args: string[], filePath: string): string[] {
  if (args.some((arg) => arg.includes("{file}"))) {
    return args.map((arg) => arg.replaceAll("{file}", filePath));
  }
  return [...args, filePath];
}

function addWaitArg(command: string, args: string[], wait: boolean | undefined): string[] {
  if (wait !== true) return args;
  const name = basename(command).toLowerCase();
  if ((name === "code" || name === "code.exe") && !args.includes("--wait")) {
    return ["--wait", ...args];
  }
  return args;
}

export function resolveEditorInvocation({
  config,
  env,
  platform,
  filePath,
}: ResolveEditorInvocationOptions): EditorInvocation {
  if (config.executable !== undefined) {
    const args = appendDraftPath(
      addWaitArg(config.executable, config.args ?? [], config.wait),
      filePath,
    );
    return { command: config.executable, args, filePath };
  }

  const editor = env["EDITOR"]?.trim();
  if (editor !== undefined && editor.length > 0) {
    const [command, ...args] = splitCommandLine(editor);
    if (command !== undefined) {
      return { command, args: appendDraftPath(args, filePath), filePath };
    }
  }

  if (platform === "win32") {
    return { command: "notepad.exe", args: [filePath], filePath };
  }
  return { command: "vi", args: [filePath], filePath };
}

async function runInteractiveEditor(invocation: EditorInvocation): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      stdio: "inherit",
      windowsHide: false,
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(`Editor exited with code ${exitCode ?? "unknown"}`));
        return;
      }
      resolve();
    });
  });
}

export function createEditorService(options: CreateEditorServiceOptions): EditorService {
  return {
    openEditor: async (initialContent) => {
      const workDir = await mkdtemp(join(options.tempRoot ?? tmpdir(), "miniagent-editor-"));
      const draftPath = join(workDir, "prompt.md");
      await writeFile(draftPath, initialContent, "utf-8");

      try {
        const invocation = resolveEditorInvocation({
          config: options.config,
          env: options.env ?? process.env,
          platform: options.platform ?? process.platform,
          filePath: draftPath,
        });
        await (options.runner ?? runInteractiveEditor)(invocation);
        return await readFile(draftPath, "utf-8");
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },
  };
}

import { z } from "zod";
import { createFunctionSchema, createProtocolSchema } from "../../core/index.js";
import type { CommandRegistry } from "./command-registry.js";
import type { PermissionService } from "./permission-service.js";
import { ResolvedReferenceSchema, type ReferenceService } from "./reference-service.js";
import type { ShellExecuteResult, ShellService } from "./shell-service.js";
import type { CLICommandContext } from "./types.js";

export const RoutedInputResultSchema = z.union([z.object({
  type: z.literal("command"),
}), z.object({
  type: z.literal("shell"),
  content: z.string(),
}), z.object({
  type: z.literal("prompt"),
  content: z.string(),
  references: z.array(z.lazy(() => ResolvedReferenceSchema)),
})]);
export type RoutedInputResult = z.infer<typeof RoutedInputResultSchema>;

export const InputRouterDepsSchema = z.object({
  commandRegistry: createProtocolSchema({
    execute: createFunctionSchema<CommandRegistry["execute"]>(),
  }),
  permissionService: createProtocolSchema({
    resolve: createFunctionSchema<PermissionService["resolve"]>(),
  }).optional(),
  getAutoApprove: createFunctionSchema<() => boolean>().optional(),
  requestApproval: createFunctionSchema<(
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<boolean>>().optional(),
  shellService: createProtocolSchema({
    execute: createFunctionSchema<ShellService["execute"]>(),
  }),
  referenceService: createProtocolSchema({
    resolveReferences: createFunctionSchema<ReferenceService["resolveReferences"]>(),
  }),
  cwd: z.string().optional(),
});
export type InputRouterDeps = z.infer<typeof InputRouterDepsSchema>;

export const InputRouterSchema = createProtocolSchema({
  route: createFunctionSchema<(
    ctx: CLICommandContext,
    input: string,
  ) => Promise<RoutedInputResult>>(),
});
export type InputRouter = z.infer<typeof InputRouterSchema>;

async function assertShellPermission(deps: InputRouterDeps, command: string): Promise<void> {
  if (deps.permissionService === undefined) {
    return;
  }

  const args = { command };
  const result = deps.permissionService.resolve(
    { toolName: "shell", args },
    deps.getAutoApprove?.() ?? false,
  );
  if (result.decision === "deny") {
    throw new Error(`Permission denied for shell shortcut: ${result.reason}`);
  }
  if (result.decision === "ask") {
    const approved = await deps.requestApproval?.("shell", args);
    if (approved !== true) {
      throw new Error("Permission rejected for shell shortcut");
    }
  }
}

function formatShellShortcutResult(result: ShellExecuteResult): string {
  const output = [result.stdout, result.stderr]
    .filter((part) => part.trim().length > 0)
    .join("\n") || "[No output]";
  const suffix = result.timedOut
    ? "\n[Timed out]"
    : result.aborted
      ? "\n[Aborted]"
      : result.exitCode !== 0
        ? `\n[Exit code: ${result.exitCode ?? "unknown"}]`
        : "";
  return `${output}${suffix}`;
}

export function createInputRouter(deps: InputRouterDeps): InputRouter {
  return {
    route: async (ctx, input): Promise<RoutedInputResult> => {
      const trimmed = input.trim();
      if (trimmed.startsWith("/")) {
        await deps.commandRegistry.execute(ctx, trimmed);
        return { type: "command" };
      }
      if (trimmed.startsWith("!")) {
        const command = trimmed.slice(1).trim();
        if (command.length === 0) {
          throw new Error("Missing shell command after !");
        }
        await assertShellPermission(deps, command);
        const result = await deps.shellService.execute({
          command,
          ...(deps.cwd !== undefined && { cwd: deps.cwd }),
        });
        return { type: "shell", content: formatShellShortcutResult(result) };
      }
      const references = await deps.referenceService.resolveReferences(input);
      return {
        type: "prompt",
        content: input,
        references,
      };
    },
  };
}

import { z } from "zod";
import { createFunctionSchema, ToolSchema } from "../../core/index.js";
import { GitServiceSchema } from "../runtime/git-service.js";
import { PermissionServiceSchema } from "../runtime/permission-service.js";

const EmptyParamsSchema = z.strictObject({});

const GitDiffParamsSchema = z.strictObject({
  staged: z.boolean().optional(),
  path: z.string().min(1).optional(),
});

const GitLogParamsSchema = z.strictObject({
  limit: z.int().positive().max(100).optional(),
});

const GitCommitParamsSchema = z.strictObject({
  message: z.string().min(1),
});

export const GitToolkitOptionsSchema = z.object({
  gitService: GitServiceSchema,
  permissionService: PermissionServiceSchema,
  getAutoApprove: createFunctionSchema<() => boolean>(),
  requestApproval: createFunctionSchema<(
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<boolean>>(),
});
export type GitToolkitOptions = z.infer<typeof GitToolkitOptionsSchema>;

export const GitToolkitSchema = z.object({
  tools: z.array(z.lazy(() => ToolSchema)),
});
export type GitToolkit = z.infer<typeof GitToolkitSchema>;

async function assertPermission(
  options: GitToolkitOptions,
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

export function createGitToolkit(options: GitToolkitOptions): GitToolkit {
  return {
    tools: [
      {
        name: "git_status",
        description: "Show git status in short porcelain format.",
        parameters: EmptyParamsSchema,
        execute: async (args): Promise<string> => {
          EmptyParamsSchema.parse(args);
          return options.gitService.statusShort();
        },
      },
      {
        name: "git_diff",
        description: "Show git diff for the workspace or a path.",
        parameters: GitDiffParamsSchema,
        execute: async (args): Promise<string> => {
          const parsed = GitDiffParamsSchema.parse(args);
          return options.gitService.diff({
            ...(parsed.path !== undefined && { path: parsed.path }),
            ...(parsed.staged !== undefined && { staged: parsed.staged }),
          });
        },
      },
      {
        name: "git_log",
        description: "Show recent git commits.",
        parameters: GitLogParamsSchema,
        execute: async (args): Promise<string> => {
          const parsed = GitLogParamsSchema.parse(args);
          return options.gitService.log({
            ...(parsed.limit !== undefined && { limit: parsed.limit }),
          });
        },
      },
      {
        name: "git_commit",
        description: "Create a git commit with the provided message.",
        parameters: GitCommitParamsSchema,
        execute: async (args): Promise<string> => {
          const parsed = GitCommitParamsSchema.parse(args);
          await assertPermission(options, "git_commit", parsed);
          return options.gitService.commit(parsed.message);
        },
      },
    ],
  };
}

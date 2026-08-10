import { z } from "zod";
import { isAbsolute, relative, resolve } from "node:path";

export const WorkspacePathSchema = z.object({
  absolutePath: z.string(),
  displayPath: z.string(),
});
export type WorkspacePath = z.infer<typeof WorkspacePathSchema>;

export function resolveWorkspacePath(
  baseDir: string,
  inputPath: string,
  options: { allowOutside?: boolean } = {},
): WorkspacePath {
  const root = resolve(baseDir);
  const target = resolve(root, inputPath);
  const rel = relative(root, target);
  if (options.allowOutside !== true && (rel.startsWith("..") || isAbsolute(rel))) {
    throw new Error(`Path escapes workspace: ${inputPath}`);
  }
  return {
    absolutePath: target,
    displayPath: rel === "" ? "." : rel.replaceAll("\\", "/"),
  };
}

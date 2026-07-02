import { isAbsolute, relative, resolve } from "node:path";

export interface WorkspacePath {
  absolutePath: string;
  displayPath: string;
}

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

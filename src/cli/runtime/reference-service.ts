import { readFile, stat } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve } from "node:path";

export interface ResolvedReference {
  token: string;
  path: string;
  displayPath: string;
  content: string;
  startLine?: number;
  endLine?: number;
}

export interface ReferenceService {
  resolveReferences(input: string): Promise<ResolvedReference[]>;
}

const REF_PATTERN = /(^|\s)(@[^\s]+)/g;

export function extractReferenceTokens(input: string): string[] {
  const tokens: string[] = [];
  for (const match of input.matchAll(REF_PATTERN)) {
    const token = match[2];
    if (token !== undefined) {
      tokens.push(token);
    }
  }
  return tokens;
}

function parseToken(token: string): { rawPath: string; startLine?: number; endLine?: number } {
  const body = token.slice(1);
  const rangeMatch = /^(.*):(\d+)(?:-(\d+))?$/.exec(body);
  if (rangeMatch === null) {
    return { rawPath: body };
  }
  const rawPath = rangeMatch[1]!;
  const startLine = Number(rangeMatch[2]);
  const endLine = rangeMatch[3] === undefined ? startLine : Number(rangeMatch[3]);
  return { rawPath, startLine, endLine };
}

function assertInside(baseDir: string, target: string): void {
  const rel = relative(baseDir, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Reference escapes workspace: ${target}`);
  }
}

function sliceLines(
  content: string,
  startLine: number | undefined,
  endLine: number | undefined,
): string {
  if (startLine === undefined) {
    return content;
  }
  const lines = content.split("\n");
  return lines.slice(startLine - 1, endLine).join("\n");
}

export function createReferenceService(baseDir: string): ReferenceService {
  const root = resolve(baseDir);
  return {
    resolveReferences: async (input): Promise<ResolvedReference[]> => {
      const refs: ResolvedReference[] = [];
      for (const token of extractReferenceTokens(input)) {
        const parsed = parseToken(token);
        const target = resolve(root, normalize(parsed.rawPath));
        assertInside(root, target);
        const info = await stat(target);
        if (info.isDirectory()) {
          throw new Error(`Reference points to a directory: ${parsed.rawPath}`);
        }
        const content = await readFile(target, "utf-8");
        refs.push({
          token,
          path: target,
          displayPath: relative(root, target).replaceAll("\\", "/"),
          content: sliceLines(content, parsed.startLine, parsed.endLine),
          ...(parsed.startLine !== undefined && { startLine: parsed.startLine }),
          ...(parsed.endLine !== undefined && { endLine: parsed.endLine }),
        });
      }
      return refs;
    },
  };
}

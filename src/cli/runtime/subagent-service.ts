import { z } from "zod";
import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { SubagentDefinitionSchema } from "../../extensions/index.js";
import { parseFrontmatter } from "../../extensions/index.js";
import type { CLIConfig } from "../config.js";

export const CLISubagentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  filePath: z.string(),
  model: z.string().optional(),
}) as z.ZodType<{
  id: string;
  name: string;
  description: string;
  filePath: string;
  model?: string;
}>;
export type CLISubagentSummary = z.infer<typeof CLISubagentSummarySchema>;

export const SubagentServiceSchema = z.custom<{
  listSubagents(): Promise<CLISubagentSummary[]>;
}>();
export type SubagentService = z.infer<typeof SubagentServiceSchema>;

function resolveSubagentRoot(baseDir: string, config: CLIConfig): string | null {
  const configuredPath = config.subagent?.path;
  if (configuredPath === undefined || configuredPath.trim().length === 0) {
    return null;
  }
  if (configuredPath.startsWith("~/")) {
    return join(homedir(), configuredPath.slice(2));
  }
  if (isAbsolute(configuredPath)) {
    return configuredPath;
  }
  return resolve(baseDir, configuredPath);
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

async function parseSubagentFile(filePath: string): Promise<CLISubagentSummary | null> {
  const raw = await readFile(filePath, "utf-8").catch(() => null);
  if (raw === null) {
    return null;
  }
  const { data, content } = parseFrontmatter(raw);
  if (content.trim().length === 0) {
    return null;
  }
  const result = SubagentDefinitionSchema.safeParse(data);
  if (!result.success) {
    return null;
  }
  return {
    id: result.data.id,
    name: result.data.name ?? result.data.id,
    description: result.data.description ?? "",
    filePath,
    ...(result.data.model !== undefined && { model: result.data.model }),
  };
}

export function createSubagentService(
  baseDir: string,
  getConfig: () => CLIConfig,
): SubagentService {
  return {
    listSubagents: async () => {
      const root = resolveSubagentRoot(baseDir, getConfig());
      if (root === null) {
        return [];
      }
      const summaries: CLISubagentSummary[] = [];
      for (const filePath of await collectMarkdownFiles(root)) {
        const summary = await parseSubagentFile(filePath);
        if (summary !== null) {
          summaries.push(summary);
        }
      }
      return summaries.sort((a, b) => a.id.localeCompare(b.id));
    },
  };
}

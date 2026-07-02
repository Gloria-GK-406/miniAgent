import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CLIAGENT_DIR, loadConfig, type CLIConfig } from "../config.js";

export interface SystemPromptConfigService {
  setSystemPrompt(prompt: string): Promise<CLIConfig>;
  unsetSystemPrompt(): Promise<CLIConfig>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function projectConfigPath(baseDir: string): string {
  return join(baseDir, CLIAGENT_DIR, "config.json");
}

async function readProjectConfig(baseDir: string): Promise<Record<string, unknown>> {
  try {
    const raw = JSON.parse(await readFile(projectConfigPath(baseDir), "utf-8")) as unknown;
    if (!isRecord(raw)) {
      throw new Error("Project config must be a JSON object");
    }
    return raw;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeProjectConfig(baseDir: string, config: Record<string, unknown>): Promise<void> {
  const path = projectConfigPath(baseDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export function createSystemPromptConfigService(baseDir: string): SystemPromptConfigService {
  return {
    setSystemPrompt: async (prompt) => {
      const trimmed = prompt.trim();
      if (trimmed.length === 0) {
        throw new Error("System prompt cannot be empty");
      }
      const config = await readProjectConfig(baseDir);
      await writeProjectConfig(baseDir, { ...config, systemPrompt: trimmed });
      return loadConfig(baseDir);
    },
    unsetSystemPrompt: async () => {
      const config = await readProjectConfig(baseDir);
      const next = { ...config };
      delete next["systemPrompt"];
      await writeProjectConfig(baseDir, next);
      return loadConfig(baseDir);
    },
  };
}

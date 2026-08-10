import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { CLIAGENT_DIR, CLIProviderSchema, loadConfig, type CLIConfig, type CLIProvider } from "../config.js";
import type { CLIProviderConnection } from "./types.js";

export const ProviderConfigServiceSchema = z.custom<{
  connectProvider(connection: CLIProviderConnection, effectiveConfig: CLIConfig): Promise<CLIConfig>;
}>();
export type ProviderConfigService = z.infer<typeof ProviderConfigServiceSchema>;

function projectConfigPath(baseDir: string): string {
  return join(baseDir, CLIAGENT_DIR, "config.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readProjectConfig(baseDir: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(projectConfigPath(baseDir), "utf-8");
    const raw = JSON.parse(content.replace(/^\uFEFF/, "")) as unknown;
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

function cloneProvider(provider: CLIProvider): CLIProvider {
  return {
    engine: provider.engine,
    key: provider.key,
    ...(provider.baseURL !== undefined && { baseURL: provider.baseURL }),
    models: provider.models.map((model) => structuredClone(model)),
  };
}

function connectionToProvider(connection: CLIProviderConnection): CLIProvider {
  return CLIProviderSchema.parse({
    engine: connection.engine,
    key: connection.key,
    ...(connection.baseURL !== undefined && { baseURL: connection.baseURL }),
    models: connection.models,
  });
}

function readLocalProviders(config: Record<string, unknown>): CLIProvider[] {
  if (config["providers"] === undefined) {
    return [];
  }
  const result = z.array(CLIProviderSchema).safeParse(config["providers"]);
  if (!result.success) {
    throw new Error("Project provider config is invalid");
  }
  return result.data;
}

function upsertProvider(
  providers: CLIProvider[],
  connection: CLIProviderConnection,
): CLIProvider[] {
  const nextProvider = connectionToProvider(connection);
  return [
    ...providers
      .filter((provider) => provider.engine !== nextProvider.engine)
      .map(cloneProvider),
    nextProvider,
  ];
}

export function createProviderConfigService(baseDir: string): ProviderConfigService {
  return {
    connectProvider: async (connection, _effectiveConfig) => {
      const projectConfig = await readProjectConfig(baseDir);
      const nextProjectConfig = {
        ...projectConfig,
        providers: upsertProvider(readLocalProviders(projectConfig), connection),
        defaultModel: connection.defaultModel,
      };
      await writeProjectConfig(baseDir, nextProjectConfig);
      return loadConfig(baseDir, { createTemplateIfMissing: false });
    },
  };
}

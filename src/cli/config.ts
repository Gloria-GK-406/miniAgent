import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ModelConfig } from "../core/config.js";
import { McpPluginConfigSchema } from "../tool/mcp/types.js";
import { SkillPluginConfigSchema } from "../tool/skill/types.js";
import { SubagentPluginConfigSchema } from "../tool/subagent.js";

export const CLIAGENT_DIR = ".cliagent";

export const CLIProviderSchema = z.object({
  name: z.string(),
  provider: z.string(),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
});

export type CLIProvider = z.infer<typeof CLIProviderSchema>;

export const CLIModelSchema = z.object({
  name: z.string(),
  provider: z.string(),
  model: z.string(),
  thinking: z.boolean().optional(),
  maxTokens: z.number().int().positive().optional(),
  contextSize: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
});

export type CLIModel = z.infer<typeof CLIModelSchema>;

export const CLIConfigSchema = z.object({
  providers: z.array(CLIProviderSchema),
  models: z.array(CLIModelSchema),
  defaultModel: z.string(),
  systemPrompt: z.string().optional(),
  mcp: McpPluginConfigSchema.optional(),
  skill: SkillPluginConfigSchema.optional(),
  subagent: SubagentPluginConfigSchema.optional(),
});

export type CLIConfig = z.infer<typeof CLIConfigSchema>;

export function resolveProvider(config: CLIConfig, providerName: string): CLIProvider {
  const provider = config.providers.find((p) => p.name === providerName);
  if (!provider) {
    throw new Error(`Provider "${providerName}" not found. Available: ${config.providers.map((p) => p.name).join(", ")}`);
  }
  return provider;
}

export function toModelConfig(m: CLIModel, provider: CLIProvider): ModelConfig {
  return {
    provider: provider.provider,
    model: m.model,
    apiKey: provider.apiKey,
    ...(provider.baseUrl !== undefined && { baseUrl: provider.baseUrl }),
    ...(m.thinking !== undefined && { thinking: m.thinking }),
    ...(m.maxTokens !== undefined && { maxTokens: m.maxTokens }),
    ...(m.contextSize !== undefined && { contextSize: m.contextSize }),
    ...(m.maxOutputTokens !== undefined && { maxOutputTokens: m.maxOutputTokens }),
    ...(m.temperature !== undefined && { temperature: m.temperature }),
    ...(m.topP !== undefined && { topP: m.topP }),
  };
}

export async function loadConfig(baseDir: string): Promise<CLIConfig> {
  const dir = join(baseDir, CLIAGENT_DIR);
  const configPath = join(dir, "config.json");

  if (!existsSync(configPath)) {
    await mkdir(dir, { recursive: true });
    const template: CLIConfig = {
      providers: [],
      models: [],
      defaultModel: "",
      systemPrompt: "You are a helpful assistant.",
      mcp: {
        servers: {
          "open-weather": {
            transport: "streamable-http",
            url: "https://mcp.open-mcp.org/api/server/open-weather@latest/mcp",
          },
        },
      },
      skill: {
        directories: [join(baseDir, CLIAGENT_DIR, "skill")],
      },
      subagent: {
        path: join(baseDir, CLIAGENT_DIR, "subagent"),
      },
    };
    await writeFile(configPath, JSON.stringify(template, null, 2), "utf-8");
    console.log(`Config template created at ${configPath}`);
    console.log("Please add your model configurations and run again.");
    process.exit(0);
  }

  const content = await readFile(configPath, "utf-8");
  const result = CLIConfigSchema.safeParse(JSON.parse(content));
  if (!result.success) {
    console.error("Invalid config file:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export function findModel(config: CLIConfig, name?: string): CLIModel | undefined {
  const target = name ?? config.defaultModel;
  return config.models.find((m) => m.name === target);
}

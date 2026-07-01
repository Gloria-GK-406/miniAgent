import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  GenerationConfigSchema,
  type GenerationConfigInput,
  ModelPresetSchema,
  ProviderModelOverridesSchema,
  ThinkingLevel,
  type ModelConfig,
  type ModelProviderConfig,
  type ModelSelector,
} from "../core/config.js";
import { McpPluginConfigSchema } from "../tool/mcp/types.js";
import { SkillPluginConfigSchema } from "../tool/skill/types.js";
import { SubagentPluginConfigSchema } from "../tool/subagent.js";

export const CLIAGENT_DIR = ".cliagent";

const CLIProviderBaseSchema = z.object({
  name: z.string(),
  engine: z.string().optional(),
  provider: z.string().optional(),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
  models: ProviderModelOverridesSchema.optional(),
});

export const CLIProviderSchema = CLIProviderBaseSchema
  .superRefine((provider, ctx) => {
    if (provider.engine === undefined && provider.provider === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["engine"],
        message: "Either engine or legacy provider is required",
      });
    }
  })
  .transform((provider) => ({
    name: provider.name,
    engine: provider.engine ?? provider.provider!,
    ...(provider.provider !== undefined && { provider: provider.provider }),
    apiKey: provider.apiKey,
    ...(provider.baseUrl !== undefined && { baseUrl: provider.baseUrl }),
    ...(provider.models !== undefined && { models: provider.models }),
  }));

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
  providers: z.array(CLIProviderSchema).default([]),
  models: z.array(CLIModelSchema).default([]),
  defaultModel: z.string().default(""),
  generation: GenerationConfigSchema.partial().optional(),
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
    provider: provider.engine,
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

function toLegacyModelPreset(m: CLIModel) {
  const maxOutputTokens = m.maxOutputTokens ?? m.maxTokens;
  return ModelPresetSchema.parse({
    model: m.model,
    displayName: m.name,
    ...(m.contextSize !== undefined && { contextSize: m.contextSize }),
    ...(maxOutputTokens !== undefined && { maxOutputTokens }),
    thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
  });
}

export function toAgentProviders(config: CLIConfig): ModelProviderConfig[] {
  return config.providers.map((provider) => {
    const legacyAdditions = config.models
      .filter((model) => model.provider === provider.name)
      .map(toLegacyModelPreset);
    const configuredAdditions = provider.models?.add ?? [];
    const additions = [...configuredAdditions];
    for (const model of legacyAdditions) {
      if (!additions.some((entry) => entry.model === model.model)) {
        additions.push(model);
      }
    }
    const models = {
      ...(additions.length > 0 && { add: additions }),
      ...(provider.models?.override !== undefined && { override: provider.models.override }),
    };

    return {
      name: provider.name,
      engine: provider.engine,
      apiKey: provider.apiKey,
      ...(provider.baseUrl !== undefined && { baseUrl: provider.baseUrl }),
      ...(Object.keys(models).length > 0 && { models }),
    };
  });
}

export function findProviderByEngineOrName(
  config: CLIConfig,
  providerOrEngine: string,
): CLIProvider | undefined {
  return config.providers.find((provider) =>
    provider.name === providerOrEngine || provider.engine === providerOrEngine,
  );
}

export function parseModelSelector(
  config: CLIConfig,
  value: string | undefined,
): ModelSelector | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const legacyModel = findModel(config, value);
  if (legacyModel) {
    return { provider: legacyModel.provider, model: legacyModel.model };
  }

  const sep = value.indexOf("/");
  if (sep !== -1) {
    const providerOrEngine = value.slice(0, sep);
    const model = value.slice(sep + 1);
    const provider = findProviderByEngineOrName(config, providerOrEngine);
    if (provider && provider.name !== providerOrEngine) {
      return { provider: provider.name, model };
    }
  }

  return { id: value };
}

export function parseDefaultModel(config: CLIConfig): ModelSelector | undefined {
  return parseModelSelector(config, config.defaultModel);
}

export function findLegacyModel(config: CLIConfig, selector?: string): CLIModel | undefined {
  const target = selector ?? config.defaultModel;
  if (target.trim().length === 0) {
    return undefined;
  }

  const byName = config.models.find((model) => model.name === target);
  if (byName) {
    return byName;
  }

  const sep = target.indexOf("/");
  if (sep === -1) {
    return undefined;
  }

  const providerOrEngine = target.slice(0, sep);
  const modelName = target.slice(sep + 1);
  const provider = findProviderByEngineOrName(config, providerOrEngine);
  return config.models.find((model) =>
    model.model === modelName
      && (
        model.provider === providerOrEngine
        || (provider !== undefined && model.provider === provider.name)
      ),
  );
}

export function toAgentGenerationConfig(
  config: CLIConfig,
  selector?: string,
): GenerationConfigInput | undefined {
  if (config.generation !== undefined) {
    return config.generation;
  }

  const legacyModel = findLegacyModel(config, selector);
  if (!legacyModel) {
    return undefined;
  }

  const maxOutputTokens = legacyModel.maxOutputTokens ?? legacyModel.maxTokens;
  const generation: GenerationConfigInput = {
    ...(legacyModel.temperature !== undefined && { temperature: legacyModel.temperature }),
    ...(legacyModel.topP !== undefined && { topP: legacyModel.topP }),
    ...(maxOutputTokens !== undefined && { maxOutputTokens }),
    ...(legacyModel.thinking !== undefined && {
      thinking: legacyModel.thinking ? ThinkingLevel.Medium : ThinkingLevel.None,
    }),
  };
  return Object.keys(generation).length > 0 ? generation : undefined;
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

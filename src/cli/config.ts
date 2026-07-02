import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  GenerationConfigSchema,
  ModelPresetSchema,
  normalizeGenerationConfig,
} from "../core/config.js";
import type {
  GenerationConfig,
  ModelProviderConfig,
  ModelSelector,
} from "../core/config.js";
import { McpPluginConfigSchema } from "../tool/mcp/types.js";
import { SkillPluginConfigSchema } from "../tool/skill/types.js";
import { SubagentPluginConfigSchema } from "../tool/subagent.js";

export const CLIAGENT_DIR = ".cliagent";

export const CLIProviderSchema = z
  .object({
    engine: z.string().min(1),
    key: z.string().min(1),
    baseURL: z.string().optional(),
    models: z.array(ModelPresetSchema),
  })
  .strict();

export type CLIProvider = z.infer<typeof CLIProviderSchema>;

export const CLIAgentModeSchema = z.enum(["build", "plan"]);
export type CLIAgentMode = z.infer<typeof CLIAgentModeSchema>;

export const CLIPermissionDecisionSchema = z.enum(["allow", "ask", "deny"]);
export type CLIPermissionDecision = z.infer<typeof CLIPermissionDecisionSchema>;

export const CLIPermissionConfigSchema = z
  .record(z.union([CLIPermissionDecisionSchema, z.record(CLIPermissionDecisionSchema)]))
  .default({
    "*": "ask",
    read: "allow",
    glob: "allow",
    grep: "allow",
  });
export type CLIPermissionConfig = z.infer<typeof CLIPermissionConfigSchema>;

export const CLIShellConfigSchema = z
  .object({
    windows: z.enum(["powershell", "git-bash", "wsl", "cmd"]).default("powershell"),
    executable: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    timeoutMs: z.number().int().positive().max(600000).default(120000),
  })
  .strict()
  .default({
    windows: "powershell",
    timeoutMs: 120000,
  });
export type CLIShellConfig = z.infer<typeof CLIShellConfigSchema>;

export const CLITUIConfigSchema = z
  .object({
    showReasoning: z.boolean().default(false),
    showToolDetails: z.boolean().default(false),
  })
  .strict()
  .default({
    showReasoning: false,
    showToolDetails: false,
  });
export type CLITUIConfig = z.infer<typeof CLITUIConfigSchema>;

export const CLIConfigSchema = z
  .object({
    providers: z.array(CLIProviderSchema).default([]),
    defaultModel: z.string().default(""),
    defaultAgent: CLIAgentModeSchema.default("build"),
    permission: CLIPermissionConfigSchema,
    shell: CLIShellConfigSchema,
    tui: CLITUIConfigSchema,
    generation: GenerationConfigSchema.partial().optional(),
    systemPrompt: z.string().optional(),
    mcp: McpPluginConfigSchema.optional(),
    skill: SkillPluginConfigSchema.optional(),
    subagent: SubagentPluginConfigSchema.optional(),
  })
  .strict();

export type CLIConfig = z.infer<typeof CLIConfigSchema>;

export function toAgentProviders(config: CLIConfig): ModelProviderConfig[] {
  return config.providers.map((provider) => ({
    provider: provider.engine,
    key: provider.key,
    ...(provider.baseURL !== undefined && { baseUrl: provider.baseURL }),
    models: provider.models,
  }));
}

export function parseModelSelector(value: string | undefined): ModelSelector | undefined {
  const target = value?.trim();
  if (target === undefined || target.length === 0) {
    return undefined;
  }

  const sep = target.indexOf("/");
  if (sep === -1) {
    return { id: target };
  }

  const provider = target.slice(0, sep);
  const id = target.slice(sep + 1);
  if (provider.length === 0 || id.length === 0) {
    throw new Error(`Invalid model selector: "${target}". Expected id or provider/id.`);
  }
  return { id, provider };
}

export function parseDefaultModel(config: CLIConfig): ModelSelector | undefined {
  return parseModelSelector(config.defaultModel);
}

export function toAgentGenerationConfig(config: CLIConfig): GenerationConfig | undefined {
  if (config.generation === undefined) {
    return undefined;
  }
  return normalizeGenerationConfig(config.generation);
}

export async function loadConfig(baseDir: string): Promise<CLIConfig> {
  const dir = join(baseDir, CLIAGENT_DIR);
  const configPath = join(dir, "config.json");

  if (!existsSync(configPath)) {
    await mkdir(dir, { recursive: true });
    const template: CLIConfig = {
      providers: [],
      defaultModel: "",
      defaultAgent: "build",
      permission: {
        "*": "ask",
        read: "allow",
        glob: "allow",
        grep: "allow",
      },
      shell: {
        windows: "powershell",
        timeoutMs: 120000,
      },
      tui: {
        showReasoning: false,
        showToolDetails: false,
      },
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
    console.log("Please add your provider configurations and run again.");
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

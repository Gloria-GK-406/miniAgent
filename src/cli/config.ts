import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, posix, win32 } from "node:path";
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

export interface LoadConfigOptions {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  homeDir?: string;
  createTemplateIfMissing?: boolean;
}

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

export const CLIEditorConfigSchema = z
  .object({
    executable: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    wait: z.boolean().optional(),
  })
  .strict()
  .default({});
export type CLIEditorConfig = z.infer<typeof CLIEditorConfigSchema>;

export const CLIDiagnosticsConfigSchema = z
  .object({
    commands: z.array(z.string().min(1)).optional(),
    timeoutMs: z.number().int().positive().max(600000).default(120000),
  })
  .strict()
  .default({
    timeoutMs: 120000,
  });
export type CLIDiagnosticsConfig = z.infer<typeof CLIDiagnosticsConfigSchema>;

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
    editor: CLIEditorConfigSchema,
    diagnostics: CLIDiagnosticsConfigSchema,
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

export function getGlobalConfigPath(options: LoadConfigOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? homedir();
  const pathJoin = platform === "win32" ? win32.join : posix.join;

  if (platform === "win32") {
    const appData = env["APPDATA"]?.trim();
    return pathJoin(
      appData !== undefined && appData.length > 0 ? appData : pathJoin(home, "AppData", "Roaming"),
      "miniagent",
      "config.json",
    );
  }

  const xdgConfigHome = env["XDG_CONFIG_HOME"]?.trim();
  return pathJoin(
    xdgConfigHome !== undefined && xdgConfigHome.length > 0 ? xdgConfigHome : pathJoin(home, ".config"),
    "miniagent",
    "config.json",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeConfigObjects(base: unknown, override: unknown): unknown {
  if (!isRecord(base)) return override;
  if (!isRecord(override)) return override;

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const previous = merged[key];
    if (isRecord(previous) && isRecord(value)) {
      merged[key] = { ...previous, ...value };
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

async function readJsonIfExists(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as unknown;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseConfig(raw: unknown): CLIConfig {
  const result = CLIConfigSchema.safeParse(raw);
  if (!result.success) {
    console.error("Invalid config file:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export function createDefaultConfigTemplate(baseDir: string): CLIConfig {
  return {
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
    editor: {},
    diagnostics: {
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
}

export async function loadConfig(baseDir: string, options: LoadConfigOptions = {}): Promise<CLIConfig> {
  const dir = join(baseDir, CLIAGENT_DIR);
  const configPath = join(dir, "config.json");
  const globalConfigPath = getGlobalConfigPath(options);

  const globalConfig = await readJsonIfExists(globalConfigPath);
  const projectConfig = await readJsonIfExists(configPath);

  if (projectConfig === null && globalConfig === null) {
    const template = createDefaultConfigTemplate(baseDir);
    if (options.createTemplateIfMissing === false) {
      return template;
    }
    await mkdir(dir, { recursive: true });
    await writeFile(configPath, JSON.stringify(template, null, 2), "utf-8");
    console.log(`Config template created at ${configPath}`);
    console.log("Please add your provider configurations and run again.");
    process.exit(0);
  }

  return parseConfig(mergeConfigObjects(globalConfig ?? {}, projectConfig ?? {}));
}

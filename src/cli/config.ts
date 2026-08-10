import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, posix, win32 } from "node:path";
import { z } from "zod";
import {
  GenerationConfigInputSchema,
  ModelPresetSchema,
  ModelRuntimeSchema,
  normalizeGenerationConfig,
} from "../core/index.js";
import type {
  GenerationConfig,
  ModelRuntime,
} from "../core/index.js";
import { McpPluginConfigSchema } from "../extensions/index.js";
import { SkillPluginConfigSchema } from "../extensions/index.js";
import { SubagentPluginConfigSchema } from "../extensions/index.js";

export const CLIAGENT_DIR = ".cliagent";

export interface LoadConfigOptions {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  homeDir?: string;
  createTemplateIfMissing?: boolean;
}

export class ConfigTemplateCreatedError extends Error {
  constructor(public readonly configPath: string) {
    super(`Config template created at ${configPath}`);
    this.name = "ConfigTemplateCreatedError";
  }
}

export const CLIProviderSchema = z
  .strictObject({
    engine: z.string().min(1),
    key: z.string().min(1),
    baseURL: z.string().optional(),
    models: z.array(ModelPresetSchema),
  });

export type CLIProvider = z.infer<typeof CLIProviderSchema>;

export const CLIConfiguredModelSchema = z.strictObject({
  provider: z.string().min(1),
  key: z.string().min(1),
  baseUrl: z.string().optional(),
  model: ModelPresetSchema,
});

export type CLIConfiguredModel = z.infer<typeof CLIConfiguredModelSchema>;

export const CLIAgentModeSchema = z.enum(["build", "plan"]);
export type CLIAgentMode = z.infer<typeof CLIAgentModeSchema>;

export const CLIPermissionDecisionSchema = z.enum(["allow", "ask", "deny"]);
export type CLIPermissionDecision = z.infer<typeof CLIPermissionDecisionSchema>;

export const CLIPermissionConfigSchema = z
  .record(
    z.string(),
    z.union([
      CLIPermissionDecisionSchema,
      z.record(z.string(), CLIPermissionDecisionSchema),
    ]),
  )
  .default({
    "*": "ask",
    read: "allow",
    glob: "allow",
    grep: "allow",
    shell: {
      "*": "ask",
      "rm -rf *": "deny",
      "rm -fr *": "deny",
      "rm -r *": "deny",
      "Remove-Item -Recurse *": "deny",
      "Remove-Item -r *": "deny",
      "rmdir /s *": "deny",
      "del /s *": "deny",
    },
  });
export type CLIPermissionConfig = z.infer<typeof CLIPermissionConfigSchema>;

export const CLIShellConfigSchema = z
  .strictObject({
    windows: z.enum(["powershell", "git-bash", "wsl", "cmd"]).default("powershell"),
    executable: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    timeoutMs: z.int().positive().max(600000).default(120000),
  })
  .default({
    windows: "powershell",
    timeoutMs: 120000,
  });
export type CLIShellConfig = z.infer<typeof CLIShellConfigSchema>;

export const CLIEditorConfigSchema = z
  .strictObject({
    executable: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    wait: z.boolean().optional(),
  })
  .default({});
export type CLIEditorConfig = z.infer<typeof CLIEditorConfigSchema>;

export const CLIDiagnosticsConfigSchema = z
  .strictObject({
    commands: z.array(z.string().min(1)).optional(),
    timeoutMs: z.int().positive().max(600000).default(120000),
  })
  .default({
    timeoutMs: 120000,
  });
export type CLIDiagnosticsConfig = z.infer<typeof CLIDiagnosticsConfigSchema>;

export const CLITUIConfigSchema = z
  .strictObject({
    showReasoning: z.boolean().default(false),
    showToolDetails: z.boolean().default(false),
  })
  .default({
    showReasoning: false,
    showToolDetails: false,
  });
export type CLITUIConfig = z.infer<typeof CLITUIConfigSchema>;

export const CLIConfigSchema = z
  .strictObject({
    providers: z.array(CLIProviderSchema).default([]),
    defaultModel: z.string().default(""),
    defaultAgent: CLIAgentModeSchema.default("build"),
    permission: CLIPermissionConfigSchema,
    shell: CLIShellConfigSchema,
    editor: CLIEditorConfigSchema,
    diagnostics: CLIDiagnosticsConfigSchema,
    tui: CLITUIConfigSchema,
    generation: GenerationConfigInputSchema.optional(),
    systemPrompt: z.string().optional(),
    mcp: McpPluginConfigSchema.optional(),
    skill: SkillPluginConfigSchema.optional(),
    subagent: SubagentPluginConfigSchema.optional(),
  });

export type CLIConfig = z.infer<typeof CLIConfigSchema>;

export function getConfiguredModels(config: CLIConfig): CLIConfiguredModel[] {
  return config.providers.flatMap((provider) =>
    provider.models.map((model) => CLIConfiguredModelSchema.parse({
      provider: provider.engine,
      key: provider.key,
      ...(provider.baseURL !== undefined && { baseUrl: provider.baseURL }),
      model,
    })),
  );
}

export function parseModelSelector(value: string | undefined): string | undefined {
  const target = value?.trim();
  if (target === undefined || target.length === 0) {
    return undefined;
  }
  const sep = target.indexOf("/");
  if (sep !== -1 && (sep === 0 || sep === target.length - 1)) {
    throw new Error(`Invalid model selector: "${target}". Expected id or provider/id.`);
  }
  return target;
}

export function parseDefaultModel(config: CLIConfig): string | undefined {
  return parseModelSelector(config.defaultModel);
}

export function formatConfiguredModelPath(model: CLIConfiguredModel): string {
  return `${model.provider}/${model.model.id}`;
}

export function findConfiguredModel(
  config: CLIConfig,
  selector: string,
): CLIConfiguredModel {
  const target = parseModelSelector(selector);
  if (target === undefined) {
    throw new Error("Model selector is empty.");
  }
  const models = getConfiguredModels(config);
  const slash = target.indexOf("/");
  const matches = slash === -1
    ? models.filter((entry) => entry.model.id === target)
    : models.filter((entry) => formatConfiguredModelPath(entry) === target);
  if (matches.length === 1) {
    return matches[0]!;
  }
  const available = models.map(formatConfiguredModelPath).join(", ") || "(none)";
  if (matches.length > 1) {
    throw new Error(`Model selector is ambiguous: ${target}. Available models: ${available}`);
  }
  throw new Error(`Model not found: ${target}. Available models: ${available}`);
}

export function toModelRuntime(configured: CLIConfiguredModel): ModelRuntime {
  const { id: _, ...model } = configured.model;
  return ModelRuntimeSchema.parse({
    provider: configured.provider,
    key: configured.key,
    ...(configured.baseUrl !== undefined && { baseUrl: configured.baseUrl }),
    model,
  });
}

export function resolveModelRuntime(config: CLIConfig, selector: string): ModelRuntime {
  return toModelRuntime(findConfiguredModel(config, selector));
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
    const content = await readFile(path, "utf-8");
    return JSON.parse(content.replace(/^\uFEFF/, "")) as unknown;
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
    const details = result.error.issues.map((issue) => {
      const path = issue.path.length === 0 ? "(root)" : issue.path.join(".");
      return `  ${path}: ${issue.message}`;
    });
    throw new Error(["Invalid config file:", ...details].join("\n"));
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
      shell: {
        "*": "ask",
        "rm -rf *": "deny",
        "rm -fr *": "deny",
        "rm -r *": "deny",
        "Remove-Item -Recurse *": "deny",
        "Remove-Item -r *": "deny",
        "rmdir /s *": "deny",
        "del /s *": "deny",
      },
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
      return parseConfig({});
    }
    await mkdir(dir, { recursive: true });
    await writeFile(configPath, JSON.stringify(template, null, 2), "utf-8");
    throw new ConfigTemplateCreatedError(configPath);
  }

  return parseConfig(mergeConfigObjects(globalConfig ?? {}, projectConfig ?? {}));
}

import { join } from "node:path";

import { getCapabilityNamespace, isCapabilityEnabled } from "../../assembly/capability.js";
import type { AgentCapabilityRule, AgentCapabilitySelector } from "../../assembly/capability.js";
import { createDefaultBlueprint, registerBuiltinBlueprintImpls } from "../../assembly/builtins.js";
import type { AgentBlueprint, BlueprintUse } from "../../assembly/blueprint.js";
import { BlueprintManager } from "../../assembly/manager.js";
import type { MiniAgent } from "../../core/agent.js";
import type { AgentUse } from "../../core/create-agent.js";
import {
  AgentConfigSchema,
  JsonValueSchema,
  type AgentConfig,
  type GenerationConfig,
  type JsonValue,
  type ModelProviderConfig,
  type NormalizedAgentConfig,
  type PathConfig,
  type ResolvedModel,
} from "../../core/config.js";
import { SessionManager } from "../../core/session.js";
import type { Message } from "../../core/types.js";
import type { ConfiguredSubagentFactory, SubagentInvocation } from "../../tool/subagent.js";
import {
  CLIAGENT_DIR,
  loadConfig,
  parseDefaultModel,
  toAgentGenerationConfig,
  toAgentProviders,
  type CLIAgentMode,
  type CLIConfig,
} from "../config.js";
import { createCLIToolkit } from "../tools/cli-toolkit.js";
import { createDiagnosticsToolkit } from "../tools/diagnostics-toolkit.js";
import { createGitToolkit } from "../tools/git-toolkit.js";
import { createDiagnosticsService } from "./diagnostics-service.js";
import { createGitService } from "./git-service.js";
import { createModeAwarePermissionService, type PermissionService } from "./permission-service.js";
import type { ShellService } from "./shell-service.js";
import type { SnapshotService } from "./snapshot-service.js";
import { buildEffectiveSystemPrompt, getBaseSystemPrompt } from "./system-prompt.js";

const DEFAULT_MESSAGE_FILE_NAME = "messages.jsonl";
const TODO_TOOL_NAMES = ["todo_create", "todo_update", "todo_delete"];
const PLUGIN_CAPABILITY_NAMESPACES = ["mcp", "skill", "subagent"] as const;
const SELF_ENFORCING_PERMISSION_TOOL_NAMES = new Set([
  "read",
  "glob",
  "grep",
  "write",
  "delete",
  "move",
  "edit",
  "multi_edit",
  "patch",
  "shell",
  "diagnostics",
  "git_status",
  "git_diff",
  "git_log",
  "git_commit",
]);

type PluginCapabilityNamespace = typeof PLUGIN_CAPABILITY_NAMESPACES[number];

const PLUGIN_BLUEPRINT_KEYS: Record<PluginCapabilityNamespace, "mcp" | "skill" | "subagent"> = {
  mcp: "mcp",
  skill: "skill",
  subagent: "subagent",
};

interface CreateCLIBlueprintOptions {
  config: CLIConfig;
  engines: string[];
  persistDir: string;
  systemPrompt: {
    prompt: string;
    baseDir?: string;
  };
  baseDir: string;
  capabilities?: AgentCapabilitySelector;
}

interface CreateBuiltinBlueprintManagerOptions {
  getAgentConfig: () => AgentConfig;
  subagentFactory: ConfiguredSubagentFactory;
  onCompressor?: (compressor: CLICompressor) => void;
}

interface ModelListAgent {
  getModels(): ResolvedModel[];
}

interface ModelSwitchAgent extends ModelListAgent {
  setResolvedModel(selector: { id: string; provider: string }): void;
}

export interface CLICompressor {
  getCompressedCount(): number;
  getSummary(): string | null;
  updateMessages(messages: Message[]): void;
  maybeCompress(): Promise<void>;
}

export interface BuildSubagentAgentConfigOptions {
  providers: ModelProviderConfig[];
  currentModel: ResolvedModel | undefined;
  generation: GenerationConfig;
  paths: PathConfig;
}

export interface CLIAgentFactoryOptions {
  baseDir: string;
  mode: CLIAgentMode | (() => CLIAgentMode);
  getConfig?: () => CLIConfig;
  getActiveSessionId?: () => string;
  permissionService: PermissionService;
  getAutoApprove: () => boolean;
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  shellService: ShellService;
  snapshotService?: SnapshotService;
  onWorkspaceFilesChanged?: () => Promise<void>;
}

export interface BuiltRuntimeAgent {
  agent: MiniAgent;
  config: CLIConfig;
  compressor: CLICompressor;
}

export interface CLIAgentFactory {
  build(sessionId: string): Promise<BuiltRuntimeAgent>;
}

interface BuiltCLIAgent {
  agent: MiniAgent;
  compressor: CLICompressor;
}

export function formatResolvedModelPath(model: ResolvedModel): string {
  return `${model.provider}/${model.id}`;
}

export function getResolvedModelPaths(agent: ModelListAgent): string[] {
  return agent.getModels().map(formatResolvedModelPath);
}

function availableModelPaths(models: ResolvedModel[]): string {
  return models.map(formatResolvedModelPath).join(", ") || "(none)";
}

function resolveMode(mode: CLIAgentFactoryOptions["mode"]): CLIAgentMode {
  return typeof mode === "function" ? mode() : mode;
}

export function findResolvedModelForCLI(models: ResolvedModel[], selector: string): ResolvedModel {
  const trimmed = selector.trim();
  if (trimmed.length === 0) {
    throw new Error("Model selector is empty.");
  }

  const sep = trimmed.indexOf("/");
  if (sep !== -1) {
    const provider = trimmed.slice(0, sep);
    const id = trimmed.slice(sep + 1);
    const found = models.find((model) => model.provider === provider && model.id === id);
    if (found) {
      return found;
    }
    throw new Error(`Model not found: ${trimmed}. Available models: ${availableModelPaths(models)}`);
  }

  const matches = models.filter((model) => model.id === trimmed);
  if (matches.length === 1) {
    return matches[0]!;
  }
  if (matches.length > 1) {
    throw new Error(`Model selector is ambiguous: ${trimmed}. Available models: ${availableModelPaths(matches)}`);
  }
  throw new Error(`Model not found: ${trimmed}. Available models: ${availableModelPaths(models)}`);
}

export function selectResolvedModelForCLI(
  agent: ModelSwitchAgent,
  selector: string,
): ResolvedModel {
  const selected = findResolvedModelForCLI(agent.getModels(), selector);
  agent.setResolvedModel({ id: selected.id, provider: selected.provider });
  return selected;
}

export function buildSubagentAgentConfig(
  options: BuildSubagentAgentConfigOptions,
): NormalizedAgentConfig {
  return AgentConfigSchema.parse({
    providers: options.providers,
    ...(options.currentModel !== undefined && {
      defaultModel: {
        id: options.currentModel.id,
        provider: options.currentModel.provider,
      },
    }),
    generation: options.generation,
    paths: options.paths,
  });
}

export function resolveSubagentSessionId(
  getActiveSessionId: (() => string | undefined) | undefined,
  fallbackSessionId: string | undefined,
): string {
  const activeSessionId = getActiveSessionId?.()?.trim();
  if (activeSessionId !== undefined && activeSessionId.length > 0) {
    return activeSessionId;
  }
  if (fallbackSessionId !== undefined && fallbackSessionId.length > 0) {
    return fallbackSessionId;
  }
  return "temp";
}

export async function createCLIAgentFactory(
  options: CLIAgentFactoryOptions,
): Promise<CLIAgentFactory> {
  const config = await loadConfig(options.baseDir);
  const sessionManager = new SessionManager(join(options.baseDir, CLIAGENT_DIR));
  await sessionManager.load();

  let currentParentAgent: MiniAgent | undefined;
  const subagentFactory = createConfiguredSubagentFactory(
    sessionManager,
    config,
    options,
    () => currentParentAgent,
  );

  return {
    build: async (sessionId): Promise<BuiltRuntimeAgent> => {
      const activeConfig = options.getConfig?.() ?? config;
      const built = await buildAgentInner(
        sessionId,
        activeConfig,
        options,
        subagentFactory,
        getBaseSystemPrompt(activeConfig),
        () => currentParentAgent?.getConfig(),
      );
      currentParentAgent = built.agent;
      return {
        ...built,
        config: activeConfig,
      };
    },
  };
}

function createConfiguredSubagentFactory(
  sessionManager: SessionManager,
  config: CLIConfig,
  options: CLIAgentFactoryOptions,
  getParentAgent: () => MiniAgent | undefined,
): ConfiguredSubagentFactory {
  const factory: ConfiguredSubagentFactory = async (request: SubagentInvocation): Promise<MiniAgent> => {
    const parentAgent = getParentAgent();
    if (!parentAgent) {
      throw new Error("Parent agent is not initialized for subagent creation.");
    }

    const activeConfig = options.getConfig?.() ?? config;
    const sessionId = resolveSubagentSessionId(
      options.getActiveSessionId,
      sessionManager.getActive()?.id,
    );
    const persistDir = sessionManager.getSessionPersistDir(sessionId);
    const currentModel = request.entry.model !== undefined
      ? findResolvedModelForCLI(parentAgent.getModels(), request.entry.model)
      : parentAgent.getCurrentResolvedModel();
    const agentConfig = buildSubagentAgentConfig({
      providers: toAgentProviders(activeConfig),
      currentModel,
      generation: parentAgent.getGenerationConfig(),
      paths: { sessiondir: join(persistDir, `subagent-${crypto.randomUUID().slice(0, 8)}`) },
    });

    const manager = createBuiltinBlueprintManager({
      getAgentConfig: () => agentConfig,
      subagentFactory: factory,
    });
    const blueprint = createCLIBlueprint({
      config: activeConfig,
      engines: uniqueEngines(activeConfig),
      persistDir: agentConfig.paths.sessiondir,
      systemPrompt: {
        prompt: request.entry.prompt,
        baseDir: options.baseDir,
      },
      baseDir: options.baseDir,
      ...(request.entry.capabilities !== undefined && {
        capabilities: request.entry.capabilities,
      }),
    });

    return manager.assemble({
      config: agentConfig,
      blueprint,
      extraUses: createRuntimeExtraUses(options),
    });
  };
  return factory;
}

async function buildAgentInner(
  sessionId: string,
  config: CLIConfig,
  options: CLIAgentFactoryOptions,
  subagentFactory: ConfiguredSubagentFactory,
  userSystemPrompt: string,
  getCurrentAgentConfig: () => AgentConfig | undefined,
): Promise<BuiltCLIAgent> {
  const persistDir = new SessionManager(join(options.baseDir, CLIAGENT_DIR)).getSessionPersistDir(sessionId);
  const defaultModel = parseDefaultModel(config);
  const generation = toAgentGenerationConfig(config);
  const agentConfig: AgentConfig = AgentConfigSchema.parse({
    providers: toAgentProviders(config),
    ...(defaultModel !== undefined && { defaultModel }),
    ...(generation !== undefined && { generation }),
    paths: { sessiondir: persistDir },
  });
  let createdCompressor: CLICompressor | undefined;
  const manager = createBuiltinBlueprintManager({
    getAgentConfig: () => getCurrentAgentConfig() ?? agentConfig,
    subagentFactory,
    onCompressor: (compressor) => {
      createdCompressor = compressor;
    },
  });
  const blueprint = createCLIBlueprint({
    config,
    engines: uniqueEngines(config),
    persistDir,
    systemPrompt: {
      prompt: buildEffectiveSystemPrompt({
        baseDir: options.baseDir,
        userSystemPrompt,
        mode: resolveMode(options.mode),
      }),
    },
    baseDir: options.baseDir,
  });

  const agent = await manager.assemble({
    config: agentConfig,
    blueprint,
    extraUses: createRuntimeExtraUses(options),
  });
  if (createdCompressor === undefined) {
    throw new Error("Expected assembled CLI agent to include a context compressor.");
  }
  return {
    agent,
    compressor: createdCompressor,
  };
}

function createRuntimeExtraUses(options: CLIAgentFactoryOptions): AgentUse[] {
  const permissionService = createModeAwarePermissionService({
    base: options.permissionService,
    getMode: () => resolveMode(options.mode),
  });
  const cliTools = createCLIToolkit({
    baseDir: options.baseDir,
    permissionService,
    getAutoApprove: options.getAutoApprove,
    requestApproval: options.requestApproval,
    shellService: options.shellService,
    ...(options.snapshotService !== undefined && { snapshotService: options.snapshotService }),
    ...(options.onWorkspaceFilesChanged !== undefined && {
      onWorkspaceFilesChanged: options.onWorkspaceFilesChanged,
    }),
  }).tools;
  const gitTools = createGitToolkit({
    gitService: createGitService(options.baseDir),
    permissionService,
    getAutoApprove: options.getAutoApprove,
    requestApproval: options.requestApproval,
  }).tools;
  const diagnosticsTools = createDiagnosticsToolkit({
    diagnosticsService: createDiagnosticsService({
      baseDir: options.baseDir,
      config: options.getConfig?.().diagnostics ?? {},
      shellService: options.shellService,
    }),
    permissionService,
    getAutoApprove: options.getAutoApprove,
    requestApproval: options.requestApproval,
  }).tools;
  return [
    ...cliTools,
    ...gitTools,
    ...diagnosticsTools,
    {
      requestApproval: async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
        if (SELF_ENFORCING_PERMISSION_TOOL_NAMES.has(toolName)) {
          return true;
        }
        const result = permissionService.resolve({ toolName, args }, options.getAutoApprove());
        if (result.decision === "deny") {
          return false;
        }
        if (result.decision === "ask") {
          return options.requestApproval(toolName, args);
        }
        return true;
      },
    },
  ];
}

function createBuiltinBlueprintManager(
  options: CreateBuiltinBlueprintManagerOptions,
): BlueprintManager {
  const manager = new BlueprintManager();
  registerBuiltinBlueprintImpls(manager, {
    getAgentConfig: options.getAgentConfig,
    getHITL: () => false,
    subagentFactory: options.subagentFactory,
    ...(options.onCompressor !== undefined && { onCompressor: options.onCompressor }),
  });
  return manager;
}

function uniqueEngines(config: CLIConfig): string[] {
  return [...new Set(config.providers.map((provider) => provider.engine))];
}

function createCLIBlueprint(options: CreateCLIBlueprintOptions): AgentBlueprint {
  const blueprint = createDefaultBlueprint({
    engines: options.engines,
    persistence: {
      rootDir: options.persistDir,
      fileName: DEFAULT_MESSAGE_FILE_NAME,
    },
    ...(options.config.mcp !== undefined && { mcp: options.config.mcp }),
    ...(options.config.skill !== undefined && { skill: options.config.skill }),
    ...(options.config.subagent !== undefined && { subagent: options.config.subagent }),
    systemPrompt: options.systemPrompt,
    agentContext: { baseDir: options.baseDir },
  });
  blueprint.tools = blueprint.tools?.filter((tool) => tool.use !== "bash");

  if (options.capabilities === undefined) {
    return blueprint;
  }

  return applySubagentCapabilities(blueprint, options.capabilities);
}

function applySubagentCapabilities(
  blueprint: AgentBlueprint,
  capabilities: AgentCapabilitySelector,
): AgentBlueprint {
  const next: AgentBlueprint = { ...blueprint };

  if (next.tools !== undefined) {
    next.tools = next.tools.filter((tool) =>
      isToolBlueprintUseEnabled(tool, capabilities.tool));
  }

  for (const namespace of PLUGIN_CAPABILITY_NAMESPACES) {
    const key = PLUGIN_BLUEPRINT_KEYS[namespace];
    const use = next[key];
    const updatedUse = injectPluginCapabilities(use, capabilities, namespace);
    if (updatedUse !== undefined) {
      next[key] = updatedUse;
    }
  }

  return next;
}

function isToolBlueprintUseEnabled(
  tool: BlueprintUse,
  rule: AgentCapabilityRule | undefined,
): boolean {
  return getToolCapabilityNames(tool.use).some((toolName) =>
    isCapabilityEnabled(toolName, rule));
}

function getToolCapabilityNames(use: string): string[] {
  return use === "todo" ? TODO_TOOL_NAMES : [use];
}

function injectPluginCapabilities(
  use: BlueprintUse | undefined,
  capabilities: AgentCapabilitySelector,
  namespace: PluginCapabilityNamespace,
): BlueprintUse | undefined {
  if (use === undefined) {
    return undefined;
  }
  const namespaceCapabilities = getCapabilityNamespace(capabilities, namespace);
  if (namespaceCapabilities === undefined) {
    return use;
  }

  const parsedCapabilities = JsonValueSchema.parse(namespaceCapabilities);
  const config = use.config ?? {};
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Cannot inject ${namespace} capabilities into non-object blueprint config.`);
  }

  return {
    ...use,
    config: {
      ...(config as Record<string, JsonValue>),
      capabilities: parsedCapabilities,
    },
  };
}

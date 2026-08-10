import { z } from "zod";
import { join } from "node:path";

import { createFunctionSchema, createProtocolSchema, getCapabilityNamespace, isCapabilityEnabled, MiniAgent } from "../../core/index.js";
import type { AgentCapabilityRule, AgentCapabilitySelector } from "../../core/index.js";
import { createDefaultBlueprint, registerBuiltinBlueprintImpls } from "../assembly/builtins.js";
import type { AgentBlueprint, BlueprintUse } from "../assembly/blueprint.js";
import { BlueprintManager } from "../assembly/manager.js";
import type { AgentUse } from "../../core/index.js";
import { PathConfigSchema, GenerationConfigSchema, AgentConfigSchema, JsonValueSchema, type AgentConfig, type JsonValue, type NormalizedAgentConfig } from "../../core/index.js";
import { SessionManager } from "../session-manager.js";
import type { Message } from "../../core/index.js";
import type { ConfiguredSubagentFactory, SubagentInvocation } from "../../extensions/index.js";
import { TodoManager } from "../../extensions/index.js";
import { CLIAgentModeSchema, CLIConfigSchema, CLIAGENT_DIR, findConfiguredModel, formatConfiguredModelPath, getConfiguredModels, loadConfig, parseDefaultModel, resolveModelRuntime, toAgentGenerationConfig, type CLIAgentMode, type CLIConfiguredModel, type CLIConfig } from "../config.js";
import { createCLIToolkit } from "../tools/cli-toolkit.js";
import { createDiagnosticsToolkit } from "../tools/diagnostics-toolkit.js";
import { createGitToolkit } from "../tools/git-toolkit.js";
import { createDiagnosticsService } from "./diagnostics-service.js";
import { createGitService } from "./git-service.js";
import { createModeAwarePermissionService, PermissionServiceSchema } from "./permission-service.js";
import { ShellServiceSchema } from "./shell-service.js";
import { SnapshotServiceSchema } from "./snapshot-service.js";
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
  omitTodoTool?: boolean;
}

interface CreateBuiltinBlueprintManagerOptions {
  subagentFactory: ConfiguredSubagentFactory;
  onCompressor?: (compressor: CLICompressor) => void;
}

const selectedModelPaths = new WeakMap<MiniAgent, string>();

export const CLICompressorSchema = createProtocolSchema({
  getCompressedCount: createFunctionSchema<() => number>(),
  getSummary: createFunctionSchema<() => string | null>(),
  updateMessages: createFunctionSchema<(messages: Message[]) => void>(),
  maybeCompress: createFunctionSchema<() => Promise<void>>(),
});
export type CLICompressor = z.infer<typeof CLICompressorSchema>;

export const BuildSubagentAgentConfigOptionsSchema = z.object({
  generation: z.lazy(() => GenerationConfigSchema),
  paths: z.lazy(() => PathConfigSchema),
});
export type BuildSubagentAgentConfigOptions = z.infer<typeof BuildSubagentAgentConfigOptionsSchema>;

export const CLIAgentFactoryOptionsSchema = z.object({
  baseDir: z.string(),
  mode: z.union([
    z.lazy(() => CLIAgentModeSchema),
    createFunctionSchema<() => CLIAgentMode>(),
  ]),
  getConfig: createFunctionSchema<() => CLIConfig>().optional(),
  getActiveSessionId: createFunctionSchema<() => string>().optional(),
  permissionService: PermissionServiceSchema,
  getAutoApprove: createFunctionSchema<() => boolean>(),
  requestApproval: createFunctionSchema<(
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<boolean>>(),
  shellService: ShellServiceSchema,
  snapshotService: SnapshotServiceSchema.optional(),
  onWorkspaceFilesChanged: createFunctionSchema<() => Promise<void>>().optional(),
});
export type CLIAgentFactoryOptions = z.infer<typeof CLIAgentFactoryOptionsSchema>;

export const BuiltRuntimeAgentSchema = z.object({
  agent: z.instanceof(MiniAgent),
  config: z.lazy(() => CLIConfigSchema),
  compressor: CLICompressorSchema,
  todoManager: z.instanceof(TodoManager),
});
export type BuiltRuntimeAgent = z.infer<typeof BuiltRuntimeAgentSchema>;

export const CLIAgentFactorySchema = createProtocolSchema({
  build: createFunctionSchema<(
    sessionId: string,
  ) => Promise<BuiltRuntimeAgent>>(),
});
export type CLIAgentFactory = z.infer<typeof CLIAgentFactorySchema>;

interface BuiltCLIAgent {
  agent: MiniAgent;
  compressor: CLICompressor;
  todoManager: TodoManager;
}

export function getConfiguredModelPaths(config: CLIConfig): string[] {
  return getConfiguredModels(config).map(formatConfiguredModelPath);
}

export function getSelectedModelPath(agent: MiniAgent): string | undefined {
  return selectedModelPaths.get(agent);
}

function resolveMode(mode: CLIAgentFactoryOptions["mode"]): CLIAgentMode {
  return typeof mode === "function" ? mode() : mode;
}

export function findConfiguredModelForCLI(config: CLIConfig, selector: string): CLIConfiguredModel {
  return findConfiguredModel(config, selector);
}

export function selectModelForCLI(
  agent: MiniAgent,
  config: CLIConfig,
  selector: string,
): CLIConfiguredModel {
  const selected = findConfiguredModelForCLI(config, selector);
  agent.setModel(resolveModelRuntime(config, formatConfiguredModelPath(selected)));
  selectedModelPaths.set(agent, formatConfiguredModelPath(selected));
  return selected;
}

export function buildSubagentAgentConfig(
  options: BuildSubagentAgentConfigOptions,
): NormalizedAgentConfig {
  return AgentConfigSchema.parse({
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
  const config = await loadConfig(options.baseDir, { createTemplateIfMissing: false });
  const sessionManager = new SessionManager(join(options.baseDir, CLIAGENT_DIR));
  await sessionManager.load();

  let currentParentAgent: MiniAgent | undefined;
  const todoManagers = new Map<string, TodoManager>();
  const getTodoManager = (sessionId: string): TodoManager => {
    const existing = todoManagers.get(sessionId);
    if (existing !== undefined) {
      return existing;
    }
    const created = new TodoManager();
    todoManagers.set(sessionId, created);
    return created;
  };
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
        getTodoManager(sessionId),
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
    const selectedModel = request.entry.model
      ?? getSelectedModelPath(parentAgent)
      ?? parseDefaultModel(activeConfig);
    const agentConfig = buildSubagentAgentConfig({
      generation: parentAgent.getGenerationConfig(),
      paths: { sessiondir: join(persistDir, `subagent-${crypto.randomUUID().slice(0, 8)}`) },
    });

    const manager = createBuiltinBlueprintManager({
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

    const child = await manager.assemble({
      config: agentConfig,
      blueprint,
      extraUses: createRuntimeExtraUses(options),
    });
    if (selectedModel !== undefined) {
      selectModelForCLI(child, activeConfig, selectedModel);
    }
    return child;
  };
  return factory;
}

async function buildAgentInner(
  sessionId: string,
  config: CLIConfig,
  options: CLIAgentFactoryOptions,
  subagentFactory: ConfiguredSubagentFactory,
  userSystemPrompt: string,
  todoManager: TodoManager,
): Promise<BuiltCLIAgent> {
  const persistDir = new SessionManager(join(options.baseDir, CLIAGENT_DIR)).getSessionPersistDir(sessionId);
  const defaultModel = parseDefaultModel(config);
  const generation = toAgentGenerationConfig(config);
  const agentConfig: AgentConfig = AgentConfigSchema.parse({
    ...(generation !== undefined && { generation }),
    paths: { sessiondir: persistDir },
  });
  let createdCompressor: CLICompressor | undefined;
  const manager = createBuiltinBlueprintManager({
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
    omitTodoTool: true,
  });

  const agent = await manager.assemble({
    config: agentConfig,
    blueprint,
    extraUses: createRuntimeExtraUses(options, todoManager),
  });
  if (defaultModel !== undefined) {
    selectModelForCLI(agent, config, defaultModel);
  }
  if (createdCompressor === undefined) {
    throw new Error("Expected assembled CLI agent to include a context compressor.");
  }
  return {
    agent,
    compressor: createdCompressor,
    todoManager,
  };
}

function createRuntimeExtraUses(
  options: CLIAgentFactoryOptions,
  todoManager?: TodoManager,
): AgentUse[] {
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
    ...(todoManager === undefined ? [] : [todoManager]),
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
  if (options.omitTodoTool === true) {
    blueprint.tools = blueprint.tools?.filter((tool) => tool.use !== "todo");
  }

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

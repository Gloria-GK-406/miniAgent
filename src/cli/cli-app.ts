import { join } from "node:path";

import { getCapabilityNamespace, isCapabilityEnabled } from "../assembly/capability.js";
import type { AgentCapabilityRule, AgentCapabilitySelector } from "../assembly/capability.js";
import { createDefaultBlueprint, registerBuiltinBlueprintImpls } from "../assembly/builtins.js";
import type { AgentBlueprint, BlueprintUse } from "../assembly/blueprint.js";
import { BlueprintManager } from "../assembly/manager.js";
import type { MiniAgent } from "../core/agent.js";
import {
    AgentConfigSchema,
    type AgentConfig,
    type GenerationConfig,
    JsonValueSchema,
    type JsonValue,
    type ModelProviderConfig,
    type NormalizedAgentConfig,
    type PathConfig,
    type ResolvedModel,
} from "../core/config.js";
import { SessionManager } from "../core/session.js";
import type { SessionMeta } from "../core/session.js";
import type { Message } from "../core/types.js";
import type { ConfiguredSubagentFactory, SubagentInvocation } from "../tool/subagent.js";
import {
    CLIAGENT_DIR,
    loadConfig,
    parseDefaultModel,
    toAgentGenerationConfig,
    toAgentProviders,
} from "./config.js";
import type { CLIConfig } from "./config.js";

const DEFAULT_MESSAGE_FILE_NAME = "messages.jsonl";
const TODO_TOOL_NAMES = ["todo_create", "todo_update", "todo_delete"];

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

const PLUGIN_CAPABILITY_NAMESPACES = ["mcp", "skill", "subagent"] as const;

type PluginCapabilityNamespace = typeof PLUGIN_CAPABILITY_NAMESPACES[number];

const PLUGIN_BLUEPRINT_KEYS: Record<PluginCapabilityNamespace, "mcp" | "skill" | "subagent"> = {
    mcp: "mcp",
    skill: "skill",
    subagent: "subagent",
};

export interface CLIAppResult {
    agent: MiniAgent;
    config: CLIConfig;
    sessionManager: SessionManager;
    session: SessionMeta;
    baseDir: string;
    hitlEnabled: boolean;
    compressor: CLICompressor;
    setHITL: (enabled: boolean) => void;
    setSystemPrompt: (prompt: string) => void;
    rebuildAgent: (sessionId: string) => Promise<MiniAgent>;
}

export interface CLICompressor {
    getCompressedCount(): number;
    getSummary(): string | null;
    updateMessages(messages: Message[]): void;
    maybeCompress(): Promise<void>;
}

interface BuiltCLIAgent {
    agent: MiniAgent;
    compressor: CLICompressor;
}

interface CreateBuiltinBlueprintManagerOptions {
    getAgentConfig: () => AgentConfig;
    subagentFactory: ConfiguredSubagentFactory;
    getHitlEnabled: () => boolean;
    onCompressor?: (compressor: CLICompressor) => void;
}

interface ModelListAgent {
    getModels(): ResolvedModel[];
}

interface ModelSwitchAgent extends ModelListAgent {
    setResolvedModel(selector: { id: string; provider: string }): void;
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

function findResolvedModelForCLI(models: ResolvedModel[], selector: string): ResolvedModel {
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

export interface BuildSubagentAgentConfigOptions {
    providers: ModelProviderConfig[];
    currentModel: ResolvedModel | undefined;
    generation: GenerationConfig;
    paths: PathConfig;
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

export async function createCLIApp(baseDir: string): Promise<CLIAppResult> {
    const config = await loadConfig(baseDir);
    const persistDir = join(baseDir, CLIAGENT_DIR);

    let hitlEnabled = true;
    let userSystemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
    let currentParentAgent: MiniAgent | undefined;
    let currentCompressor: CLICompressor | undefined;
    let rebuildQueue: Promise<void> = Promise.resolve();
    const compressor = createCompressorProxy(() => currentCompressor);

    const sessionManager = new SessionManager(persistDir);
    await sessionManager.load();

    const subagentFactory = createConfiguredSubagentFactory(
        sessionManager,
        config,
        baseDir,
        () => currentParentAgent,
        () => hitlEnabled,
    );

    const sessions = sessionManager.list();
    let session: SessionMeta;
    if (sessions.length > 0) {
        session = sessions[0]!;
        sessionManager.setActive(session.id);
    } else {
        session = await sessionManager.create("default");
    }

    const built = await buildAgentInner(
        session.id,
        baseDir,
        config,
        subagentFactory,
        userSystemPrompt,
        () => currentParentAgent?.getConfig(),
        () => hitlEnabled,
    );
    currentParentAgent = built.agent;
    currentCompressor = built.compressor;

    return {
        agent: built.agent,
        config,
        sessionManager,
        session,
        baseDir,
        hitlEnabled,
        compressor,
        setHITL: (enabled: boolean) => { hitlEnabled = enabled; },
        setSystemPrompt: (prompt: string) => { userSystemPrompt = prompt; },
        rebuildAgent: async (sessionId: string) => {
            const rebuildTask = rebuildQueue.then(async (): Promise<MiniAgent> => {
                const previousAgent = currentParentAgent;
                const rebuilt = await buildAgentInner(
                    sessionId,
                    baseDir,
                    config,
                    subagentFactory,
                    userSystemPrompt,
                    () => currentParentAgent?.getConfig(),
                    () => hitlEnabled,
                );
                await previousAgent?.destroy();
                currentParentAgent = rebuilt.agent;
                currentCompressor = rebuilt.compressor;
                return rebuilt.agent;
            });
            rebuildQueue = rebuildTask.then(
                () => {},
                () => {},
            );
            return rebuildTask;
        },
    };
}

function createConfiguredSubagentFactory(
    sessionManager: SessionManager,
    config: CLIConfig,
    baseDir: string,
    getParentAgent: () => MiniAgent | undefined,
    getHitlEnabled: () => boolean,
): ConfiguredSubagentFactory {
    const factory: ConfiguredSubagentFactory = async (request: SubagentInvocation): Promise<MiniAgent> => {
        const parentAgent = getParentAgent();
        if (!parentAgent) {
            throw new Error("Parent agent is not initialized for subagent creation.");
        }

        const active = sessionManager.getActive();
        const sessionId = active?.id ?? "temp";
        const persistDir = sessionManager.getSessionPersistDir(sessionId);
        const currentModel = request.entry.model !== undefined
            ? findResolvedModelForCLI(parentAgent.getModels(), request.entry.model)
            : parentAgent.getCurrentResolvedModel();
        const agentConfig = buildSubagentAgentConfig({
            providers: toAgentProviders(config),
            currentModel,
            generation: parentAgent.getGenerationConfig(),
            paths: { sessiondir: join(persistDir, `subagent-${crypto.randomUUID().slice(0, 8)}`) },
        });

        const manager = createBuiltinBlueprintManager(
            {
                getAgentConfig: () => agentConfig,
                subagentFactory: factory,
                getHitlEnabled,
            },
        );
        const blueprint = createCLIBlueprint({
            config,
            engines: uniqueEngines(config),
            persistDir: agentConfig.paths.sessiondir,
            systemPrompt: {
                prompt: request.entry.prompt,
                baseDir,
            },
            baseDir,
            ...(request.entry.capabilities !== undefined && {
                capabilities: request.entry.capabilities,
            }),
        });

        return manager.assemble({
            config: agentConfig,
            blueprint,
        });
    };
    return factory;
}

async function buildAgentInner(
    sessionId: string,
    baseDir: string,
    config: CLIConfig,
    subagentFactory: ConfiguredSubagentFactory,
    userSystemPrompt: string,
    getCurrentAgentConfig: () => AgentConfig | undefined,
    getHitlEnabled: () => boolean,
): Promise<BuiltCLIAgent> {
    const persistDir = new SessionManager(join(baseDir, CLIAGENT_DIR)).getSessionPersistDir(sessionId);
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
        getHitlEnabled,
        onCompressor: (compressor) => {
            createdCompressor = compressor;
        },
    });
    const blueprint = createCLIBlueprint({
        config,
        engines: uniqueEngines(config),
        persistDir,
        systemPrompt: {
            prompt: buildSystemPrompt(baseDir, userSystemPrompt),
        },
        baseDir,
    });

    const agent = await manager.assemble({ config: agentConfig, blueprint });
    if (createdCompressor === undefined) {
        throw new Error("Expected assembled CLI agent to include a context compressor.");
    }
    return {
        agent,
        compressor: createdCompressor,
    };
}

function createBuiltinBlueprintManager(
    options: CreateBuiltinBlueprintManagerOptions,
): BlueprintManager {
    const manager = new BlueprintManager();
    registerBuiltinBlueprintImpls(manager, {
        getAgentConfig: options.getAgentConfig,
        getHITL: options.getHitlEnabled,
        subagentFactory: options.subagentFactory,
        onCompressor: options.onCompressor,
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
    blueprint.approval = { use: "allow-all" };

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

function createCompressorProxy(
    getCompressor: () => CLICompressor | undefined,
): CLICompressor {
    const requireCompressor = (): CLICompressor => {
        const compressor = getCompressor();
        if (compressor === undefined) {
            throw new Error("Context compressor is not initialized.");
        }
        return compressor;
    };

    return {
        getCompressedCount: () => requireCompressor().getCompressedCount(),
        getSummary: () => requireCompressor().getSummary(),
        updateMessages: (messages: Message[]): void => {
            requireCompressor().updateMessages(messages);
        },
        maybeCompress: async (): Promise<void> => {
            await requireCompressor().maybeCompress();
        },
    };
}

function buildSystemPrompt(baseDir: string, userSystemPrompt: string): string {
    return [
        userSystemPrompt,
        "",
        `Working directory: ${baseDir}`,
        "You have access to tools for reading, writing, editing, searching files, executing bash commands, managing tasks, and spawning sub-agents.",
        "Use tools proactively to accomplish tasks. For file operations, always use the appropriate tool.",
    ].join("\n");
}

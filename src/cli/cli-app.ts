import { join } from "node:path";

import { AgentAssembler, AgentBlueprintRegistry } from "../assembly/assembler.js";
import type { AgentBlueprint } from "../assembly/blueprint.js";
import { defineAgentModule } from "../core/module.js";
import { LLMEngineManager } from "../core/llm.js";
import type { ModelCatalogLLMEngine } from "../core/llm.js";
import { MessageType } from "../core/types.js";
import type { Message } from "../core/types.js";
import type { MiniAgent } from "../core/agent.js";
import type { AgentConfig, ModelConfig, ModelGroup } from "../core/config.js";
import type { JsonValue } from "../core/config.js";
import { SessionManager } from "../core/session.js";
import type { SessionMeta } from "../core/session.js";
import { ContextCompressor } from "../context/compressor.js";
import {
    AnthropicEngine, OpenAIEngine, OpenAICompatibleEngine,
    GLMEngine, GLMCodePlanEngine, NVIDIAEngine,
} from "../engine/index.js";
import {
    readTool, writeTool, editTool, globTool, grepTool, bashTool,
    TodoManager, SubagentPlugin, AgentContextProvider,
    McpPlugin, SkillPlugin,
} from "../tool/index.js";
import type { ConfiguredSubagentFactory, SubagentInvocation } from "../tool/subagent.js";
import {
    CLIAGENT_DIR,
    findModel,
    findProviderByEngineOrName,
    loadConfig,
    parseDefaultModel,
    parseModelSelector,
    resolveProvider,
    toAgentGenerationConfig,
    toAgentProviders,
    toModelConfig,
} from "./config.js";
import type { CLIConfig, CLIModel } from "./config.js";

const ENGINE_FACTORIES: Record<string, () => ModelCatalogLLMEngine> = {
    anthropic: () => new AnthropicEngine(),
    openai: () => new OpenAIEngine(),
    "openai-compatible": () => new OpenAICompatibleEngine(),
    glm: () => new GLMEngine(),
    "glm-codeplan": () => new GLMCodePlanEngine(),
    nvidia: () => new NVIDIAEngine(),
};

const AUTO_APPROVE_TOOLS = ["read", "glob", "grep"];

const SHARED_BLUEPRINT: AgentBlueprint = {
    uses: [
        "tool.read",
        "tool.write",
        "tool.edit",
        "tool.glob",
        "tool.grep",
        "tool.bash",
        "tool.todo",
        "plugin.subagent",
        "plugin.mcp",
        "plugin.skill",
        "plugin.agent-context",
    ],
};

export interface CLIAppResult {
    agent: MiniAgent;
    config: CLIConfig;
    activeModel: CLIModel | undefined;
    sessionManager: SessionManager;
    session: SessionMeta;
    baseDir: string;
    hitlEnabled: boolean;
    compressor: ContextCompressor;
    assembler: AgentAssembler;
    manager: LLMEngineManager;
    blueprintRegistry: AgentBlueprintRegistry;
    setHITL: (enabled: boolean) => void;
    setSystemPrompt: (prompt: string) => void;
    rebuildAgent: (sessionId: string) => Promise<MiniAgent>;
    buildModelsMap: () => Map<string, ModelGroup>;
    resolveModelConfig: (path: string) => ModelConfig;
}

export async function createCLIApp(baseDir: string): Promise<CLIAppResult> {
    const config = await loadConfig(baseDir);

    const persistDir = join(baseDir, CLIAGENT_DIR);
    const manager = new LLMEngineManager();

    let hitlEnabled = true;
    let userSystemPrompt = config.systemPrompt ?? "You are a helpful assistant.";

    function buildModelsMap(): Map<string, ModelGroup> {
        const map = new Map<string, ModelGroup>();
        for (const m of config.models) {
            const p = resolveProvider(config, m.provider);
            const group = map.get(p.engine);
            if (group) {
                group.models.push(toModelConfig(m, p));
            } else {
                map.set(p.engine, { models: [toModelConfig(m, p)] });
            }
        }
        return map;
    }

    function resolveModelConfig(path: string): ModelConfig {
        const sep = path.indexOf("/");
        if (sep === -1) {
            throw new Error(`Invalid model path: "${path}". Expected format: provider/model`);
        }
        const providerOrEngine = path.slice(0, sep);
        const model = path.slice(sep + 1);
        const provider = findProviderByEngineOrName(config, providerOrEngine);
        const engine = provider?.engine ?? providerOrEngine;
        const group = buildModelsMap().get(engine);
        if (!group) {
            throw new Error(`No models found for provider: "${providerOrEngine}"`);
        }
        const found = group.models.find((entry) => entry.model === model);
        if (!found) {
            throw new Error(`Model "${model}" not found for provider: "${providerOrEngine}"`);
        }
        return found;
    }

    registerEngines(manager, config);

    const blueprintRegistry = createBlueprintRegistry(
        baseDir,
        () => createConfiguredSubagentFactory(
            sessionManager,
            assembler,
            manager,
            config,
            baseDir,
            buildModelsMap,
            resolveModelConfig,
        ),
    );
    const assembler = new AgentAssembler(blueprintRegistry);

    const activeModel = findModel(config);

    const sessionManager = new SessionManager(persistDir);
    await sessionManager.load();

    const sessions = sessionManager.list();
    let session: SessionMeta;
    if (sessions.length > 0) {
        session = sessions[0]!;
        sessionManager.setActive(session.id);
    } else {
        session = await sessionManager.create("default");
    }

    const compressor = new ContextCompressor({
        maxMessages: 60,
        keepRecent: 15,
    });

    const agent = await buildAgentInner(
        session.id,
        baseDir,
        activeModel,
        config,
        manager,
        assembler,
        compressor,
        userSystemPrompt,
        () => hitlEnabled,
    );

    return {
        agent,
        config,
        activeModel,
        sessionManager,
        session,
        baseDir,
        hitlEnabled,
        compressor,
        assembler,
        manager,
        blueprintRegistry,
        setHITL: (enabled: boolean) => { hitlEnabled = enabled; },
        setSystemPrompt: (prompt: string) => { userSystemPrompt = prompt; },
        rebuildAgent: async (sessionId: string) => {
            return buildAgentInner(
                sessionId,
                baseDir,
                activeModel,
                config,
                manager,
                assembler,
                compressor,
                userSystemPrompt,
                () => hitlEnabled,
            );
        },
        buildModelsMap,
        resolveModelConfig,
    };
}

function registerEngines(manager: LLMEngineManager, config: CLIConfig): void {
    const seen = new Set<string>();
    for (const p of config.providers) {
        if (seen.has(p.engine)) continue;
        const createEngine = ENGINE_FACTORIES[p.engine];
        if (!createEngine) continue;
        manager.register(createEngine());
        seen.add(p.engine);
    }
}

function createCLIApprover(getHitlEnabled: () => boolean) {
    const autoApprovedTools = new Set(AUTO_APPROVE_TOOLS);

    return defineAgentModule({
        requestApproval: async (toolName: string, _args: Record<string, unknown>): Promise<boolean> => {
            if (autoApprovedTools.has(toolName)) {
                return true;
            }
            if (!getHitlEnabled()) {
                return true;
            }
            return true;
        },
    });
}

function createBlueprintRegistry(
    baseDir: string,
    subagentFactory: () => ConfiguredSubagentFactory,
): AgentBlueprintRegistry {
    const registry = new AgentBlueprintRegistry();

    registry.register("tool.read", () => readTool);
    registry.register("tool.write", () => writeTool);
    registry.register("tool.edit", () => editTool);
    registry.register("tool.glob", () => globTool);
    registry.register("tool.grep", () => grepTool);
    registry.register("tool.bash", () => bashTool);
    registry.register("tool.todo", () => new TodoManager());
    registry.register("plugin.subagent", () => new SubagentPlugin(subagentFactory()));
    registry.register("plugin.mcp", () => new McpPlugin());
    registry.register("plugin.skill", () => new SkillPlugin());
    registry.register("plugin.agent-context", () => new AgentContextProvider(baseDir));

    return registry;
}

function createConfiguredSubagentFactory(
    sessionManager: SessionManager,
    assembler: AgentAssembler,
    manager: LLMEngineManager,
    config: CLIConfig,
    baseDir: string,
    buildModelsMap: () => Map<string, ModelGroup>,
    resolveModelConfig: (path: string) => ModelConfig,
): ConfiguredSubagentFactory {
    return async (request: SubagentInvocation): Promise<MiniAgent> => {
        const active = sessionManager.getActive();
        const sessionId = active?.id ?? "temp";
        const persistDir = sessionManager.getSessionPersistDir(sessionId);

        const subPlugins = new Map<string, JsonValue>();
        if (config.mcp) {
            subPlugins.set("mcp", JSON.parse(JSON.stringify(config.mcp)) as JsonValue);
        }
        if (config.skill) {
            subPlugins.set("skill", JSON.parse(JSON.stringify(config.skill)) as JsonValue);
        }
        if (config.subagent) {
            subPlugins.set("subagent", JSON.parse(JSON.stringify(config.subagent)) as JsonValue);
        }

        const modelSelector = request.entry.model !== undefined
            ? parseModelSelector(config, request.entry.model)
            : parseDefaultModel(config);
        const generation = toAgentGenerationConfig(config, request.entry.model);
        const legacyModel = request.entry.model !== undefined
            ? tryResolveModelConfig(resolveModelConfig, request.entry.model)
            : undefined;
        const agentConfig: AgentConfig = {
            ...(legacyModel !== undefined && { model: legacyModel }),
            models: new Map(),
            providers: toAgentProviders(config),
            ...(modelSelector !== undefined && { defaultModel: modelSelector }),
            ...(generation !== undefined && { generation }),
            plugins: subPlugins,
            paths: { sessiondir: join(persistDir, `subagent-${crypto.randomUUID().slice(0, 8)}`) },
        };
        const assembleOpts: Parameters<typeof assembler.assemble>[0] = {
            llm: manager,
            config: agentConfig,
            blueprint: SHARED_BLUEPRINT,
            extraUses: [
                defineAgentModule({
                    priority: 0,
                    collect: async (): Promise<Message[]> => [
                        {
                            id: "system-prompt",
                            type: MessageType.System,
                            content: [
                                request.entry.prompt,
                                "",
                                `Subagent id: ${request.entry.id}`,
                                `Working directory: ${baseDir}`,
                            ].join("\n"),
                        },
                    ],
                }),
            ],
        };
        if (request.entry.capabilities !== undefined) {
            assembleOpts.capabilities = request.entry.capabilities;
        }
        return assembler.assemble(assembleOpts);
    };
}

function tryResolveModelConfig(
    resolveModelConfig: (path: string) => ModelConfig,
    path: string,
): ModelConfig | undefined {
    try {
        return resolveModelConfig(path);
    } catch {
        return undefined;
    }
}

async function buildAgentInner(
    sessionId: string,
    baseDir: string,
    _activeModel: CLIModel | undefined,
    config: CLIConfig,
    manager: LLMEngineManager,
    assembler: AgentAssembler,
    compressor: ContextCompressor,
    userSystemPrompt: string,
    getHitlEnabled: () => boolean,
): Promise<MiniAgent> {
    const persistDir = new SessionManager(join(baseDir, CLIAGENT_DIR)).getSessionPersistDir(sessionId);
    const plugins = new Map<string, JsonValue>();
    if (config.mcp) {
        plugins.set("mcp", JSON.parse(JSON.stringify(config.mcp)) as JsonValue);
    }
    if (config.skill) {
        plugins.set("skill", JSON.parse(JSON.stringify(config.skill)) as JsonValue);
    }
    if (config.subagent) {
        plugins.set("subagent", JSON.parse(JSON.stringify(config.subagent)) as JsonValue);
    }
    const defaultModel = parseDefaultModel(config);
    const generation = toAgentGenerationConfig(config);
    const agentConfig: AgentConfig = {
        models: new Map(),
        providers: toAgentProviders(config),
        ...(defaultModel !== undefined && { defaultModel }),
        ...(generation !== undefined && { generation }),
        plugins,
        paths: { sessiondir: persistDir },
    };

    const agent = await assembler.assemble({
        llm: manager,
        config: agentConfig,
        blueprint: SHARED_BLUEPRINT,
        extraUses: [
            defineAgentModule({
                priority: 0,
                collect: async (): Promise<Message[]> => [
                    {
                        id: "system-prompt",
                        type: MessageType.System,
                        content: buildSystemPrompt(baseDir, userSystemPrompt),
                    },
                ],
            }),
            compressor,
            (createdAgent: MiniAgent): void => {
                createdAgent.register(createCLIApprover(getHitlEnabled));
            },
        ],
    });
    return agent;
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

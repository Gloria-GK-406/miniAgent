import { join } from "node:path";

import { AgentAssembler, AgentBlueprintRegistry } from "../assembly/assembler.js";
import type { AgentBlueprint } from "../assembly/blueprint.js";
import { ContextCompressor } from "../context/compressor.js";
import type { MiniAgent } from "../core/agent.js";
import {
    AgentConfigSchema,
    type AgentConfig,
    type GenerationConfig,
    type JsonValue,
    type ModelProviderConfig,
    type NormalizedAgentConfig,
    type PathConfig,
    type ResolvedModel,
} from "../core/config.js";
import { LLMEngineManager } from "../core/llm.js";
import type { LLMEngine } from "../core/llm.js";
import { defineAgentModule } from "../core/module.js";
import { MessageType } from "../core/types.js";
import type { Message } from "../core/types.js";
import {
    AnthropicEngine,
    GLMCodePlanEngine,
    GLMEngine,
    NVIDIAEngine,
    OpenAICompatibleEngine,
    OpenAIEngine,
} from "../engine/index.js";
import { SessionManager } from "../core/session.js";
import type { SessionMeta } from "../core/session.js";
import {
    AgentContextProvider,
    McpPlugin,
    SkillPlugin,
    SubagentPlugin,
    TodoManager,
    bashTool,
    editTool,
    globTool,
    grepTool,
    readTool,
    writeTool,
} from "../tool/index.js";
import type { ConfiguredSubagentFactory, SubagentInvocation } from "../tool/subagent.js";
import {
    CLIAGENT_DIR,
    loadConfig,
    parseDefaultModel,
    toAgentGenerationConfig,
    toAgentProviders,
} from "./config.js";
import type { CLIConfig } from "./config.js";

const ENGINE_FACTORIES: Record<string, () => LLMEngine> = {
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
    plugins: Map<string, JsonValue>;
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
        plugins: options.plugins,
        paths: options.paths,
    });
}

export async function createCLIApp(baseDir: string): Promise<CLIAppResult> {
    const config = await loadConfig(baseDir);
    const persistDir = join(baseDir, CLIAGENT_DIR);
    const manager = new LLMEngineManager();

    let hitlEnabled = true;
    let userSystemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
    let currentParentAgent: MiniAgent | undefined;

    registerEngines(manager, config);

    const sessionManager = new SessionManager(persistDir);
    await sessionManager.load();

    const blueprintRegistry = createBlueprintRegistry(
        baseDir,
        () => createConfiguredSubagentFactory(
            sessionManager,
            assembler,
            manager,
            config,
            baseDir,
            () => currentParentAgent,
        ),
    );
    const assembler = new AgentAssembler(blueprintRegistry);

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
        config,
        manager,
        assembler,
        compressor,
        userSystemPrompt,
        () => hitlEnabled,
    );
    currentParentAgent = agent;

    return {
        agent,
        config,
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
            const rebuilt = await buildAgentInner(
                sessionId,
                baseDir,
                config,
                manager,
                assembler,
                compressor,
                userSystemPrompt,
                () => hitlEnabled,
            );
            currentParentAgent = rebuilt;
            return rebuilt;
        },
    };
}

function registerEngines(manager: LLMEngineManager, config: CLIConfig): void {
    const seen = new Set<string>();
    for (const p of config.providers) {
        if (seen.has(p.engine)) {
            continue;
        }
        const createEngine = ENGINE_FACTORIES[p.engine];
        if (!createEngine) {
            throw new Error(
                `Unsupported engine "${p.engine}". Known engines: ${Object.keys(ENGINE_FACTORIES).join(", ")}`,
            );
        }
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

function clonePluginConfig(config: CLIConfig): Map<string, JsonValue> {
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
    return plugins;
}

function createConfiguredSubagentFactory(
    sessionManager: SessionManager,
    assembler: AgentAssembler,
    manager: LLMEngineManager,
    config: CLIConfig,
    baseDir: string,
    getParentAgent: () => MiniAgent | undefined,
): ConfiguredSubagentFactory {
    return async (request: SubagentInvocation): Promise<MiniAgent> => {
        const parentAgent = getParentAgent();
        if (!parentAgent) {
            throw new Error("Parent agent is not initialized for subagent creation.");
        }

        const active = sessionManager.getActive();
        const sessionId = active?.id ?? "temp";
        const persistDir = sessionManager.getSessionPersistDir(sessionId);
        const plugins = clonePluginConfig(config);
        const currentModel = request.entry.model !== undefined
            ? findResolvedModelForCLI(parentAgent.getModels(), request.entry.model)
            : parentAgent.getCurrentResolvedModel();
        const agentConfig = buildSubagentAgentConfig({
            providers: toAgentProviders(config),
            currentModel,
            generation: parentAgent.getGenerationConfig(),
            plugins,
            paths: { sessiondir: join(persistDir, `subagent-${crypto.randomUUID().slice(0, 8)}`) },
        });
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

async function buildAgentInner(
    sessionId: string,
    baseDir: string,
    config: CLIConfig,
    manager: LLMEngineManager,
    assembler: AgentAssembler,
    compressor: ContextCompressor,
    userSystemPrompt: string,
    getHitlEnabled: () => boolean,
): Promise<MiniAgent> {
    const persistDir = new SessionManager(join(baseDir, CLIAGENT_DIR)).getSessionPersistDir(sessionId);
    const plugins = clonePluginConfig(config);
    const defaultModel = parseDefaultModel(config);
    const generation = toAgentGenerationConfig(config);
    const agentConfig: AgentConfig = {
        providers: toAgentProviders(config),
        ...(defaultModel !== undefined && { defaultModel }),
        ...(generation !== undefined && { generation }),
        plugins,
        paths: { sessiondir: persistDir },
    };

    return assembler.assemble({
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

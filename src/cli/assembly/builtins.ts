import { z } from "zod";
import { AgentContextProvider } from "../../extensions/index.js";
import { bashTool } from "../../extensions/index.js";
import { editTool } from "../../extensions/index.js";
import { globTool } from "../../extensions/index.js";
import { grepTool } from "../../extensions/index.js";
import { McpPlugin } from "../../extensions/index.js";
import { McpPluginConfigSchema, type McpPluginConfigInput } from "../../extensions/index.js";
import { readTool } from "../../extensions/index.js";
import { SkillPlugin } from "../../extensions/index.js";
import { SkillPluginConfigSchema, type SkillPluginConfigInput } from "../../extensions/index.js";
import {
    SubagentPlugin,
    SubagentPluginConfigSchema,
    type ConfiguredSubagentFactory,
    type SubagentPluginConfigInput,
} from "../../extensions/index.js";
import { TodoManager } from "../../extensions/index.js";
import { writeTool } from "../../extensions/index.js";
import { ContextCompressor } from "../../extensions/index.js";
import {
    AnthropicEngine,
    GLMCodePlanEngine,
    GLMEngine,
    NVIDIAEngine,
    OpenAICompatibleEngine,
    OpenAIEngine,
} from "../../engine/index.js";
import { FileMessageSource } from "../../extensions/index.js";
import { FileStore } from "../../extensions/index.js";
import { MessageType, type ContextProvider } from "../../core/index.js";
import type { JsonValue } from "../../core/index.js";
import type { BlueprintManager } from "./manager.js";
import type { AgentBlueprint, BlueprintUse } from "./blueprint.js";

const EmptyConfigSchema = z.strictObject({});

const FilePersistenceConfigSchema = z.strictObject({
    rootDir: z.string().min(1),
    fileName: z.string().min(1),
});

const SummaryCompressionConfigSchema = z.strictObject({
    maxMessages: z.int().positive().default(60),
    keepRecent: z.int().nonnegative().default(15),
});

const StaticAutoApproveConfigSchema = z.strictObject({
    autoApproveTools: z.array(z.string().min(1)).default(["read", "glob", "grep"]),
});

const SystemPromptConfigSchema = z.strictObject({
    prompt: z.string(),
    baseDir: z.string().optional(),
});

const AgentContextConfigSchema = z.strictObject({
    baseDir: z.string().min(1),
});

type FilePersistenceConfig = z.output<typeof FilePersistenceConfigSchema>;
type SummaryCompressionConfig = z.output<typeof SummaryCompressionConfigSchema>;
type StaticAutoApproveConfig = z.output<typeof StaticAutoApproveConfigSchema>;
type SystemPromptConfig = z.output<typeof SystemPromptConfigSchema>;
type AgentContextConfig = z.output<typeof AgentContextConfigSchema>;

export interface RegisterBuiltinBlueprintImplsOptions {
    subagentFactory: ConfiguredSubagentFactory;
    getHITL?: () => boolean;
    onCompressor?: (compressor: ContextCompressor) => void;
}

export interface DefaultBlueprintOptions {
    engines: string[];
    persistence: z.input<typeof FilePersistenceConfigSchema>;
    mcp?: McpPluginConfigInput;
    skill?: SkillPluginConfigInput;
    subagent?: SubagentPluginConfigInput;
    systemPrompt?: z.input<typeof SystemPromptConfigSchema>;
    agentContext?: z.input<typeof AgentContextConfigSchema>;
}

function blueprintUse(use: string, config?: JsonValue): BlueprintUse {
    return config === undefined ? { use } : { use, config };
}

function toJsonValue(value: unknown): JsonValue {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => toJsonValue(item));
    }
    if (typeof value === "object") {
        const object: Record<string, JsonValue> = {};
        for (const [key, item] of Object.entries(value)) {
            if (item !== undefined) {
                object[key] = toJsonValue(item);
            }
        }
        return object;
    }
    throw new Error("Blueprint config values must be JSON serializable.");
}

function parseBlueprintConfig<T extends z.ZodType>(
    schema: T,
    config: z.input<T>,
): JsonValue {
    return toJsonValue(schema.parse(config));
}

function createSystemPromptProvider(config: SystemPromptConfig): ContextProvider & { id: string } {
    const content = config.baseDir === undefined
        ? config.prompt
        : `${config.prompt}\n\nWorking directory: ${config.baseDir}`;

    return {
        id: "system-prompt",
        priority: 0,
        collect: async () => [{
            id: "system-prompt",
            type: MessageType.System,
            content,
        }],
    };
}

export function registerBuiltinBlueprintImpls(
    manager: BlueprintManager,
    options: RegisterBuiltinBlueprintImplsOptions,
): void {
    manager.registerEngineImpl("anthropic", {
        configSchema: EmptyConfigSchema,
        create: () => new AnthropicEngine(),
    });
    manager.registerEngineImpl("openai", {
        configSchema: EmptyConfigSchema,
        create: () => new OpenAIEngine(),
    });
    manager.registerEngineImpl("openai-compatible", {
        configSchema: EmptyConfigSchema,
        create: () => new OpenAICompatibleEngine(),
    });
    manager.registerEngineImpl("glm", {
        configSchema: EmptyConfigSchema,
        create: () => new GLMEngine(),
    });
    manager.registerEngineImpl("glm-codeplan", {
        configSchema: EmptyConfigSchema,
        create: () => new GLMCodePlanEngine(),
    });
    manager.registerEngineImpl("nvidia", {
        configSchema: EmptyConfigSchema,
        create: () => new NVIDIAEngine(),
    });

    manager.registerPersistenceImpl<FilePersistenceConfig>("file", {
        configSchema: FilePersistenceConfigSchema,
        create: (config) => {
            const store = new FileStore(config.rootDir);
            return {
                store,
                messageSource: new FileMessageSource(store, config.fileName),
            };
        },
    });

    manager.registerCompressionImpl<SummaryCompressionConfig>("summary", {
        configSchema: SummaryCompressionConfigSchema,
        create: (config) => {
            const compressor = new ContextCompressor({
                maxMessages: config.maxMessages,
                keepRecent: config.keepRecent,
            });
            options.onCompressor?.(compressor);
            return compressor;
        },
    });

    manager.registerToolImpl("read", {
        configSchema: EmptyConfigSchema,
        create: () => readTool,
    });
    manager.registerToolImpl("write", {
        configSchema: EmptyConfigSchema,
        create: () => writeTool,
    });
    manager.registerToolImpl("edit", {
        configSchema: EmptyConfigSchema,
        create: () => editTool,
    });
    manager.registerToolImpl("glob", {
        configSchema: EmptyConfigSchema,
        create: () => globTool,
    });
    manager.registerToolImpl("grep", {
        configSchema: EmptyConfigSchema,
        create: () => grepTool,
    });
    manager.registerToolImpl("bash", {
        configSchema: EmptyConfigSchema,
        create: () => bashTool,
    });
    manager.registerToolImpl("todo", {
        configSchema: EmptyConfigSchema,
        create: () => new TodoManager(),
    });

    manager.registerMcpImpl("config", {
        configSchema: McpPluginConfigSchema,
        create: async (config) => {
            const plugin = new McpPlugin(config);
            await plugin.initialize();
            return plugin;
        },
    });

    manager.registerSkillImpl("local-directory", {
        configSchema: SkillPluginConfigSchema,
        create: async (config) => {
            const plugin = new SkillPlugin(config);
            await plugin.initialize();
            return plugin;
        },
    });

    manager.registerSubagentImpl("local-directory-sync", {
        configSchema: SubagentPluginConfigSchema,
        create: async (config) => {
            const plugin = new SubagentPlugin(config, options.subagentFactory);
            await plugin.initialize();
            return plugin;
        },
    });

    manager.registerApprovalImpl<StaticAutoApproveConfig>("static-auto-approve", {
        configSchema: StaticAutoApproveConfigSchema,
        create: (config) => ({
            requestApproval: async (toolName: string, _args: Record<string, unknown>) => {
                if (config.autoApproveTools.includes(toolName)) {
                    return true;
                }
                return !(options.getHITL?.() ?? false);
            },
        }),
    });

    manager.registerContextImpl<SystemPromptConfig>("system-prompt", {
        configSchema: SystemPromptConfigSchema,
        create: createSystemPromptProvider,
    });
    manager.registerContextImpl<AgentContextConfig>("agent-context", {
        configSchema: AgentContextConfigSchema,
        create: (config) => new AgentContextProvider(config.baseDir),
    });
}

export function createDefaultBlueprint(options: DefaultBlueprintOptions): AgentBlueprint {
    const context: BlueprintUse[] = [];
    if (options.systemPrompt !== undefined) {
        context.push(blueprintUse(
            "system-prompt",
            parseBlueprintConfig(SystemPromptConfigSchema, options.systemPrompt),
        ));
    }
    if (options.agentContext !== undefined) {
        context.push(blueprintUse(
            "agent-context",
            parseBlueprintConfig(AgentContextConfigSchema, options.agentContext),
        ));
    }

    const blueprint: AgentBlueprint = {
        engines: options.engines.map((engine) => blueprintUse(engine)),
        tools: ["read", "write", "edit", "glob", "grep", "bash", "todo"].map((tool) =>
            blueprintUse(tool)),
        compression: blueprintUse("summary", {
            maxMessages: 60,
            keepRecent: 15,
        }),
        persistence: blueprintUse(
            "file",
            parseBlueprintConfig(FilePersistenceConfigSchema, options.persistence),
        ),
        approval: blueprintUse("static-auto-approve"),
    };

    if (options.mcp !== undefined) {
        blueprint.mcp = blueprintUse(
            "config",
            parseBlueprintConfig(McpPluginConfigSchema, options.mcp),
        );
    }
    if (options.skill !== undefined) {
        blueprint.skill = blueprintUse(
            "local-directory",
            parseBlueprintConfig(SkillPluginConfigSchema, options.skill),
        );
    }
    if (options.subagent !== undefined) {
        blueprint.subagent = blueprintUse(
            "local-directory-sync",
            parseBlueprintConfig(SubagentPluginConfigSchema, options.subagent),
        );
    }
    if (context.length > 0) {
        blueprint.context = context;
    }

    return blueprint;
}

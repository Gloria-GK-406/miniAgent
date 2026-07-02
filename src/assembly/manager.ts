import { z } from "zod";
import { createMiniAgent } from "../core/create-agent.js";
import type { AgentUse } from "../core/create-agent.js";
import type { MiniAgent, MiniAgentOptions } from "../core/agent.js";
import type { AgentConfig } from "../core/config.js";
import { LLMEngineManager } from "../core/llm.js";
import type { LLMEngine } from "../core/llm.js";
import { AgentBlueprintSchema } from "./blueprint.js";
import type { AgentBlueprint, BlueprintUse } from "./blueprint.js";

export const PresetBlueprintDomainSchema = z.enum([
    "engine",
    "persistence",
    "compression",
    "tool",
    "mcp",
    "skill",
    "subagent",
    "approval",
    "context",
]);

export type PresetBlueprintDomain = z.infer<typeof PresetBlueprintDomainSchema>;
type AgentUseBlueprintDomain = Exclude<PresetBlueprintDomain, "engine" | "persistence">;

export interface BlueprintImpl<C, R> {
    configSchema: z.ZodType<C, z.ZodTypeDef, unknown>;
    create: (config: C) => R | Promise<R>;
}

export type AgentUseFactoryResult = AgentUse | AgentUse[];
export type AgentUseBlueprintFactory<C> = BlueprintImpl<C, AgentUseFactoryResult>;
export type EngineBlueprintFactory<C> = BlueprintImpl<C, LLMEngine>;
export type PersistenceBlueprintFactory<C> = BlueprintImpl<C, MiniAgentOptions>;
export type AgentUseBlueprintImpl<C> = AgentUseBlueprintFactory<C>;
export type EngineBlueprintImpl<C> = EngineBlueprintFactory<C>;
export type PersistenceBlueprintImpl<C> = PersistenceBlueprintFactory<C>;

interface StoredBlueprintImpl<R> {
    configSchema: z.ZodTypeAny;
    create: (config: unknown) => R | Promise<R>;
}

interface DestroyableAgentUse {
    destroy: () => void | Promise<void>;
}

interface PresetImplMaps {
    engine: Map<string, StoredBlueprintImpl<LLMEngine>>;
    persistence: Map<string, StoredBlueprintImpl<MiniAgentOptions>>;
    compression: Map<string, StoredBlueprintImpl<AgentUseFactoryResult>>;
    tool: Map<string, StoredBlueprintImpl<AgentUseFactoryResult>>;
    mcp: Map<string, StoredBlueprintImpl<AgentUseFactoryResult>>;
    skill: Map<string, StoredBlueprintImpl<AgentUseFactoryResult>>;
    subagent: Map<string, StoredBlueprintImpl<AgentUseFactoryResult>>;
    approval: Map<string, StoredBlueprintImpl<AgentUseFactoryResult>>;
    context: Map<string, StoredBlueprintImpl<AgentUseFactoryResult>>;
}

export interface AssembleBlueprintOptions {
    blueprint: AgentBlueprint;
    config: AgentConfig;
    extraUses?: AgentUse[];
}

function storeImpl<C, R>(impl: BlueprintImpl<C, R>): StoredBlueprintImpl<R> {
    return {
        configSchema: impl.configSchema,
        create: (config: unknown) => impl.create(config as C),
    };
}

function normalizeUseResult(result: AgentUseFactoryResult): AgentUse[] {
    return Array.isArray(result) ? result : [result];
}

function isDestroyableAgentUse(value: AgentUse): value is AgentUse & DestroyableAgentUse {
    return typeof value === "object"
        && value !== null
        && "destroy" in value
        && typeof (value as { destroy?: unknown }).destroy === "function";
}

async function destroyCreatedUses(createdUses: AgentUse[]): Promise<void> {
    const destroyables = createdUses.filter(isDestroyableAgentUse).reverse();
    await Promise.allSettled(destroyables.map(async (use) => {
        await use.destroy();
    }));
}

function appendCreatedUses(
    preparedUses: AgentUse[],
    createdUses: AgentUse[],
    result: AgentUseFactoryResult,
): void {
    const normalized = normalizeUseResult(result);
    preparedUses.push(...normalized);
    createdUses.push(...normalized);
}

export class BlueprintManager {
    private readonly presetImpls: PresetImplMaps = {
        engine: new Map(),
        persistence: new Map(),
        compression: new Map(),
        tool: new Map(),
        mcp: new Map(),
        skill: new Map(),
        subagent: new Map(),
        approval: new Map(),
        context: new Map(),
    };

    private readonly customTypes = new Set<string>();
    private readonly customImpls = new Map<string, Map<string, StoredBlueprintImpl<AgentUseFactoryResult>>>();

    registerEngineImpl<C>(name: string, impl: EngineBlueprintImpl<C>): void {
        this.registerImpl("engine", name, impl, this.presetImpls.engine);
    }

    registerPersistenceImpl<C>(name: string, impl: PersistenceBlueprintImpl<C>): void {
        this.registerImpl("persistence", name, impl, this.presetImpls.persistence);
    }

    registerCompressionImpl<C>(name: string, impl: AgentUseBlueprintImpl<C>): void {
        this.registerImpl("compression", name, impl, this.presetImpls.compression);
    }

    registerToolImpl<C>(name: string, impl: AgentUseBlueprintImpl<C>): void {
        this.registerImpl("tool", name, impl, this.presetImpls.tool);
    }

    registerMcpImpl<C>(name: string, impl: AgentUseBlueprintImpl<C>): void {
        this.registerImpl("mcp", name, impl, this.presetImpls.mcp);
    }

    registerSkillImpl<C>(name: string, impl: AgentUseBlueprintImpl<C>): void {
        this.registerImpl("skill", name, impl, this.presetImpls.skill);
    }

    registerSubagentImpl<C>(name: string, impl: AgentUseBlueprintImpl<C>): void {
        this.registerImpl("subagent", name, impl, this.presetImpls.subagent);
    }

    registerApprovalImpl<C>(name: string, impl: AgentUseBlueprintImpl<C>): void {
        this.registerImpl("approval", name, impl, this.presetImpls.approval);
    }

    registerContextImpl<C>(name: string, impl: AgentUseBlueprintImpl<C>): void {
        this.registerImpl("context", name, impl, this.presetImpls.context);
    }

    registerCustomType(type: string): void {
        if (PresetBlueprintDomainSchema.safeParse(type).success) {
            throw new Error(`Custom blueprint type conflicts with preset domain: ${type}.`);
        }
        if (this.customTypes.has(type)) {
            throw new Error(`Custom blueprint type is already registered: ${type}`);
        }
        this.customTypes.add(type);
        if (!this.customImpls.has(type)) {
            this.customImpls.set(type, new Map());
        }
    }

    registerCustomImpl<C>(type: string, name: string, impl: AgentUseBlueprintImpl<C>): void {
        const implementations = this.customImpls.get(type);
        if (!this.customTypes.has(type) || !implementations) {
            throw new Error(`Unknown custom blueprint type: ${type}.`);
        }
        this.registerImpl(type, name, impl, implementations);
    }

    listImpls(domain: PresetBlueprintDomain): string[] {
        const parsedDomain = PresetBlueprintDomainSchema.parse(domain);
        return [...this.presetImpls[parsedDomain].keys()];
    }

    listCustomImpls(type: string): string[] {
        const implementations = this.customImpls.get(type);
        if (!this.customTypes.has(type) || !implementations) {
            throw new Error(`Unknown custom blueprint type: ${type}.`);
        }
        return [...implementations.keys()];
    }

    async assemble(options: AssembleBlueprintOptions): Promise<MiniAgent> {
        const blueprint = AgentBlueprintSchema.parse(options.blueprint);
        const llm = new LLMEngineManager();
        const createdUses: AgentUse[] = [];

        try {
            for (const use of blueprint.engines ?? []) {
                const engine = await this.createEngine(use);
                llm.register(engine);
            }

            const persistence = blueprint.persistence
                ? await this.createPersistence(blueprint.persistence)
                : {};
            const preparedUses = await this.prepareUses(blueprint, createdUses, options.extraUses);

            return createMiniAgent({
                llm,
                config: options.config,
                ...persistence,
                use: preparedUses,
            });
        } catch (error: unknown) {
            await destroyCreatedUses(createdUses);
            throw error;
        }
    }

    private registerImpl<C, R>(
        domain: string,
        name: string,
        impl: BlueprintImpl<C, R>,
        implementations: Map<string, StoredBlueprintImpl<R>>,
    ): void {
        if (implementations.has(name)) {
            throw new Error(`Blueprint implementation is already registered: ${domain}/${name}`);
        }
        implementations.set(name, storeImpl(impl));
    }

    private async prepareUses(
        blueprint: AgentBlueprint,
        createdUses: AgentUse[],
        extraUses: AgentUse[] = [],
    ): Promise<AgentUse[]> {
        const preparedUses: AgentUse[] = [];
        await this.appendPresetUse(preparedUses, createdUses, "compression", blueprint.compression);
        await this.appendPresetUses(preparedUses, createdUses, "tool", blueprint.tools);
        await this.appendPresetUse(preparedUses, createdUses, "mcp", blueprint.mcp);
        await this.appendPresetUse(preparedUses, createdUses, "skill", blueprint.skill);
        await this.appendPresetUse(preparedUses, createdUses, "subagent", blueprint.subagent);
        await this.appendPresetUse(preparedUses, createdUses, "approval", blueprint.approval);
        await this.appendPresetUses(preparedUses, createdUses, "context", blueprint.context);
        await this.appendCustomUses(preparedUses, createdUses, blueprint.custom);
        preparedUses.push(...extraUses);
        return preparedUses;
    }

    private async appendPresetUse(
        preparedUses: AgentUse[],
        createdUses: AgentUse[],
        domain: AgentUseBlueprintDomain,
        use: BlueprintUse | undefined,
    ): Promise<void> {
        if (!use) {
            return;
        }
        const created = await this.createAgentUse(domain, use);
        appendCreatedUses(preparedUses, createdUses, created);
    }

    private async appendPresetUses(
        preparedUses: AgentUse[],
        createdUses: AgentUse[],
        domain: AgentUseBlueprintDomain,
        uses: BlueprintUse[] | undefined,
    ): Promise<void> {
        for (const use of uses ?? []) {
            await this.appendPresetUse(preparedUses, createdUses, domain, use);
        }
    }

    private async appendCustomUses(
        preparedUses: AgentUse[],
        createdUses: AgentUse[],
        custom: AgentBlueprint["custom"],
    ): Promise<void> {
        for (const [type, uses] of Object.entries(custom ?? {})) {
            const implementations = this.customImpls.get(type);
            if (!this.customTypes.has(type) || !implementations) {
                throw new Error(`Unknown custom blueprint type: ${type}.`);
            }
            for (const use of Array.isArray(uses) ? uses : [uses]) {
                const created = await this.createImpl(type, implementations, use);
                appendCreatedUses(preparedUses, createdUses, created);
            }
        }
    }

    private async createEngine(use: BlueprintUse): Promise<LLMEngine> {
        return await this.createImpl("engine", this.presetImpls.engine, use);
    }

    private async createPersistence(use: BlueprintUse): Promise<MiniAgentOptions> {
        return await this.createImpl("persistence", this.presetImpls.persistence, use);
    }

    private async createAgentUse(
        domain: AgentUseBlueprintDomain,
        use: BlueprintUse,
    ): Promise<AgentUseFactoryResult> {
        return await this.createImpl(domain, this.presetImpls[domain], use);
    }

    private async createImpl<R>(
        domain: string,
        implementations: Map<string, StoredBlueprintImpl<R>>,
        use: BlueprintUse,
    ): Promise<R> {
        const impl = implementations.get(use.use);
        if (!impl) {
            throw new Error(`Unknown blueprint implementation: ${domain}/${use.use}.`);
        }

        const parsedConfig = impl.configSchema.safeParse(
            use.config === undefined ? {} : use.config,
        );
        if (!parsedConfig.success) {
            throw new Error(`Invalid blueprint config for ${domain}/${use.use}: ${parsedConfig.error.message}`);
        }

        return await impl.create(parsedConfig.data);
    }
}

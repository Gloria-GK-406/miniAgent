import { createMiniAgent } from "../core/create-agent.js";
import type { AgentUse } from "../core/create-agent.js";
import type { MiniAgent } from "../core/agent.js";
import type { AgentConfig } from "../core/config.js";
import type { LLMRequest } from "../core/types.js";
import { AgentCapabilityConsumerSchema, AgentCapabilitySelectorSchema } from "./capability.js";
import type { AgentCapabilityConsumer, AgentCapabilitySelector } from "./capability.js";
import { AgentBlueprintSchema } from "./blueprint.js";
import type { AgentBlueprint } from "./blueprint.js";

export type AgentUseFactoryResult = AgentUse | AgentUse[];
export type AgentUseFactory = () => AgentUseFactoryResult | Promise<AgentUseFactoryResult>;

export class AgentBlueprintRegistry {
    private factories = new Map<string, AgentUseFactory>();

    register(id: string, factory: AgentUseFactory): void {
        if (this.factories.has(id)) {
            throw new Error(`Blueprint use is already registered: ${id}`);
        }
        this.factories.set(id, factory);
    }

    async create(id: string): Promise<AgentUse[]> {
        const factory = this.factories.get(id);
        if (!factory) {
            throw new Error(`Unknown blueprint use: ${id}`);
        }

        const created = await factory();
        return Array.isArray(created) ? created : [created];
    }
}

export interface AssembleAgentOptions {
    llm: LLMRequest;
    config: AgentConfig;
    blueprint: AgentBlueprint;
    capabilities?: AgentCapabilitySelector;
    extraUses?: AgentUse[];
}

export class AgentAssembler {
    private registry: AgentBlueprintRegistry;

    constructor(registry: AgentBlueprintRegistry) {
        this.registry = registry;
    }

    async assemble(options: AssembleAgentOptions): Promise<MiniAgent> {
        const blueprint = AgentBlueprintSchema.parse(options.blueprint);
        const capabilities = AgentCapabilitySelectorSchema.parse(options.capabilities ?? {});
        const preparedUses: AgentUse[] = [];

        for (const id of blueprint.uses) {
            const items = await this.registry.create(id);
            preparedUses.push(...await this.prepareUses(items, capabilities));
        }

        if (options.extraUses !== undefined) {
            preparedUses.push(...await this.prepareUses(options.extraUses, capabilities));
        }

        return createMiniAgent({
            llm: options.llm,
            config: options.config,
            use: preparedUses,
        });
    }

    private async prepareUses(
        uses: AgentUse[],
        capabilities: AgentCapabilitySelector,
    ): Promise<AgentUse[]> {
        const prepared: AgentUse[] = [];

        for (const item of uses) {
            if (AgentCapabilityConsumerSchema.safeParse(item).success) {
                const accepted = await (item as AgentCapabilityConsumer)
                    .consumeAgentCapabilities(capabilities);
                if (!accepted) {
                    continue;
                }
            }

            prepared.push(item);
        }

        return prepared;
    }
}

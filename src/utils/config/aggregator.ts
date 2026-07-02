import { PersistConfigSchema } from "../../core/config.js";
import type { ModelProviderConfig, PersistConfig, PersistConfigFile } from "../../core/config.js";

function cloneProvider(provider: ModelProviderConfig): ModelProviderConfig {
    return {
        ...provider,
        models: (provider.models ?? []).map((model) => ({
            ...model,
            ...(model.thinkingLevels !== undefined && {
                thinkingLevels: [...model.thinkingLevels],
            }),
            ...(model.capabilities !== undefined && {
                capabilities: structuredClone(model.capabilities),
            }),
            ...(model.metadata !== undefined && {
                metadata: structuredClone(model.metadata),
            }),
        })),
    };
}

export class PersistentConfigAggregator {
    static aggregate(configs: PersistConfigFile[]): PersistConfig {
        let merged = PersistConfigSchema.parse({});
        for (const config of configs) {
            merged = this.merge(merged, config);
        }
        return merged;
    }

    static merge(base: PersistConfig, override: PersistConfigFile): PersistConfig {
        const providers = new Map(
            base.providers.map((provider) => [provider.provider, cloneProvider(provider)]),
        );
        for (const provider of override.providers) {
            providers.set(provider.provider, cloneProvider(provider));
        }

        const generation = {
            ...(base.generation ?? {}),
            ...(override.generation ?? {}),
        };

        return PersistConfigSchema.parse({
            ...(base.defaultModel !== undefined && { defaultModel: base.defaultModel }),
            ...(override.defaultModel !== undefined && { defaultModel: override.defaultModel }),
            providers: [...providers.values()],
            ...(Object.keys(generation).length > 0 && { generation }),
            plugins: new Map([...base.plugins, ...override.plugins]),
        });
    }
}

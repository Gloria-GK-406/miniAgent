import { PersistConfigSchema } from "../../core/config.js";
import type { ModelGroup, PersistConfig, PersistConfigFile } from "../../core/config.js";

function cloneGroup(group: ModelGroup): ModelGroup {
    return {
        models: group.models.map((model) => ({ ...model })),
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
        const models: Record<string, ModelGroup> = {
            ...Object.fromEntries(
                Object.entries(base.models).map(([name, group]) => [name, cloneGroup(group)]),
            ),
        };
        for (const [name, group] of Object.entries(override.models)) {
            models[name] = cloneGroup(group);
        }

        return PersistConfigSchema.parse({
            ...(base.defaultModel !== undefined && { defaultModel: base.defaultModel }),
            ...(override.defaultModel !== undefined && { defaultModel: override.defaultModel }),
            models,
            plugins: {
                ...base.plugins,
                ...override.plugins,
            },
        });
    }
}

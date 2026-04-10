import { AgentConfigSchema } from "../../core/config.js";
import type {
    AgentConfig,
    JsonValue,
    ModelGroup,
    PersistConfig,
    RuntimeConfig,
} from "../../core/config.js";

function cloneGroup(group: ModelGroup): ModelGroup {
    return {
        models: group.models.map((model) => ({ ...model })),
    };
}

function toModelGroupMap(models: PersistConfig["models"]): Map<string, ModelGroup> {
    return new Map(
        Object.entries(models).map(([name, group]) => [name, cloneGroup(group)]),
    );
}

function toPluginMap(plugins: PersistConfig["plugins"]): Map<string, JsonValue> {
    return new Map(Object.entries(plugins));
}

export class AgentConfigResolver {
    static resolve(persist: PersistConfig, runtime: RuntimeConfig): AgentConfig {
        const activeModel = runtime.activeModel ?? persist.defaultModel;
        if (!activeModel) {
            throw new Error("No active model configured. Set runtime.activeModel or persist.defaultModel.");
        }

        const group = persist.models[activeModel];
        if (!group) {
            throw new Error(`Configured model group not found: ${activeModel}`);
        }

        const [model] = group.models;
        if (!model) {
            throw new Error(`Configured model group is empty: ${activeModel}`);
        }

        return AgentConfigSchema.parse({
            model: { ...model },
            models: toModelGroupMap(persist.models),
            plugins: toPluginMap(persist.plugins),
            paths: runtime.paths,
        });
    }
}

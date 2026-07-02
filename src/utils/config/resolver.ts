import { AgentConfigSchema } from "../../core/config.js";
import type {
    ModelProviderConfig,
    NormalizedAgentConfig,
    NormalizedRuntimeConfig,
    PersistConfig,
} from "../../core/config.js";

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

export class AgentConfigResolver {
    static resolve(persist: PersistConfig, runtime: NormalizedRuntimeConfig): NormalizedAgentConfig {
        const defaultModel = runtime.activeModel ?? persist.defaultModel;
        return AgentConfigSchema.parse({
            providers: persist.providers.map(cloneProvider),
            ...(defaultModel !== undefined && { defaultModel }),
            ...(persist.generation !== undefined && { generation: persist.generation }),
            paths: runtime.paths,
        });
    }
}

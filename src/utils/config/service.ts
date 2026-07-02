import { PersistConfigSchema, RuntimeConfigSchema } from "../../core/config.js";
import type {
    NormalizedAgentConfig,
    NormalizedRuntimeConfig,
    PersistConfig,
    RuntimeConfig,
} from "../../core/config.js";
import { PersistentConfigAggregator } from "./aggregator.js";
import { PersistentConfigFileLoader } from "./file-loader.js";
import { AgentConfigResolver } from "./resolver.js";

export type AgentConfigLoadOptions = {
    configFiles: string[];
    runtime: RuntimeConfig;
};

export type AgentConfigLoadResult = {
    persistConfig: PersistConfig;
    agentConfig: NormalizedAgentConfig;
};

export class AgentConfigService {
    async load(options: AgentConfigLoadOptions): Promise<AgentConfigLoadResult> {
        const persistConfig = await AgentConfigService.loadPersistConfig(options.configFiles);
        const agentConfig = AgentConfigService.resolve(persistConfig, options.runtime);
        return { persistConfig, agentConfig };
    }

    static async loadPersistConfig(paths: string[]): Promise<PersistConfig> {
        const files = await PersistentConfigFileLoader.loadFiles(paths);
        return PersistentConfigAggregator.aggregate(files);
    }

    static resolve(persist: PersistConfig, runtime: RuntimeConfig): NormalizedAgentConfig {
        const validatedPersist = PersistConfigSchema.parse(persist);
        const validatedRuntime: NormalizedRuntimeConfig = RuntimeConfigSchema.parse(runtime);
        return AgentConfigResolver.resolve(validatedPersist, validatedRuntime);
    }

    static async loadFromFiles(paths: string[], runtime: RuntimeConfig): Promise<NormalizedAgentConfig> {
        const persist = await this.loadPersistConfig(paths);
        return this.resolve(persist, runtime);
    }
}

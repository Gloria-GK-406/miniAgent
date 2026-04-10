import { PersistConfigSchema, RuntimeConfigSchema } from "../../core/config.js";
import type { AgentConfig, PersistConfig, RuntimeConfig } from "../../core/config.js";
import { PersistentConfigAggregator } from "./aggregator.js";
import { PersistentConfigFileLoader } from "./file-loader.js";
import { AgentConfigResolver } from "./resolver.js";

export class AgentConfigService {
    static async loadPersistConfig(paths: string[]): Promise<PersistConfig> {
        const files = await PersistentConfigFileLoader.loadFiles(paths);
        return PersistentConfigAggregator.aggregate(files);
    }

    static resolve(persist: PersistConfig, runtime: RuntimeConfig): AgentConfig {
        const validatedPersist = PersistConfigSchema.parse(persist);
        const validatedRuntime = RuntimeConfigSchema.parse(runtime);
        return AgentConfigResolver.resolve(validatedPersist, validatedRuntime);
    }

    static async loadFromFiles(paths: string[], runtime: RuntimeConfig): Promise<AgentConfig> {
        const persist = await this.loadPersistConfig(paths);
        return this.resolve(persist, runtime);
    }
}

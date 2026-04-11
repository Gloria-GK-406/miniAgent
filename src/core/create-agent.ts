import type { AgentConfig } from "./config.js";
import { MiniAgent } from "./agent.js";
import type { LLMRequest } from "./types.js";
import type { AgentModule, AgentRegistrable } from "./module.js";

export type AgentInstaller = (agent: MiniAgent) => void;

export type AgentUse = AgentRegistrable | AgentModule | AgentInstaller;

export interface CreateMiniAgentOptions {
    llm: LLMRequest;
    config: AgentConfig;
    use?: AgentUse[];
}

export function createMiniAgent(options: CreateMiniAgentOptions): MiniAgent {
    const agent = new MiniAgent(options.llm, options.config);

    for (const item of options.use ?? []) {
        if (typeof item === "function") {
            item(agent);
            continue;
        }
        agent.register(item);
    }

    return agent;
}

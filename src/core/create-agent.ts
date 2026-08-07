import type { AgentConfig } from "./config.js";
import { MiniAgent } from "./agent.js";
import type { MiniAgentOptions } from "./agent.js";
import type { LLMRequest } from "./types.js";
import type { AgentModule, AgentRegistrable } from "./module.js";

export type AgentInstaller = (agent: MiniAgent) => void;

export type AgentUse = AgentRegistrable | AgentModule | AgentInstaller;

export interface CreateMiniAgentOptions extends MiniAgentOptions {
    llm: LLMRequest;
    config: AgentConfig;
    use?: AgentUse[];
}

export function createMiniAgent(options: CreateMiniAgentOptions): MiniAgent {
    const agent = new MiniAgent(options.llm, options.config, {
        ...(options.store !== undefined && { store: options.store }),
        ...(options.messageSource !== undefined && { messageSource: options.messageSource }),
        ...(options.tokenUsage !== undefined && { tokenUsage: options.tokenUsage }),
    });

    for (const item of options.use ?? []) {
        if (typeof item === "function") {
            item(agent);
            continue;
        }
        agent.register(item);
    }

    return agent;
}

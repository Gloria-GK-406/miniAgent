import { z } from "zod";
import { AgentConfigSchema } from "./config.js";
import { MiniAgent, MiniAgentOptionsSchema } from "./agent.js";
import { createFunctionSchema } from "./function-schema.js";
import { LLMRequestSchema } from "./types.js";
import { AgentModuleSchema, AgentRegistrableSchema } from "./module.js";

export const AgentInstallerSchema = createFunctionSchema<(agent: MiniAgent) => void>();

export type AgentInstaller = z.infer<typeof AgentInstallerSchema>;

export const AgentUseSchema = z.union([
    AgentRegistrableSchema,
    AgentModuleSchema,
    AgentInstallerSchema,
]);

export type AgentUse = z.infer<typeof AgentUseSchema>;

export const CreateMiniAgentOptionsSchema = MiniAgentOptionsSchema.extend({
    llm: LLMRequestSchema,
    config: AgentConfigSchema,
    use: z.array(AgentUseSchema).optional(),
});

export type CreateMiniAgentOptions = z.input<typeof CreateMiniAgentOptionsSchema>;

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

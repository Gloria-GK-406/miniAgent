import { z } from "zod";
import type { Tool, ToolProvider } from "./types.js";
import type { Message } from "../core/types.js";
import { MessageType } from "../core/types.js";
import type { MiniAgent } from "../core/agent.js";

export type AgentFactory = (task: string, systemPrompt: string) => Promise<MiniAgent>;

const SubAgentParamsSchema = z.object({
    task: z.string().describe("The task description to delegate to the sub-agent"),
    system_prompt: z.string().optional().describe("Custom system prompt for the sub-agent"),
});

export class SubAgentProvider implements ToolProvider {
    private factory: AgentFactory;

    constructor(factory: AgentFactory) {
        this.factory = factory;
    }

    async getTools(): Promise<Tool[]> {
        return [
            {
                name: "subagent",
                description: "Spawn a sub-agent to handle a specific task autonomously. The sub-agent has access to all tools and can perform multi-step operations. Use this for complex tasks that benefit from focused attention.",
                parameters: SubAgentParamsSchema,
                execute: async (args: Record<string, unknown>): Promise<string> => {
                    const parsed = SubAgentParamsSchema.parse(args);
                    const agent = await this.factory(parsed.task, parsed.system_prompt ?? "");

                    const inputMsg: Message = {
                        id: crypto.randomUUID(),
                        type: MessageType.User,
                        content: parsed.task,
                    };

                    const messages = await agent.run(inputMsg);
                    const lastMsg = messages[messages.length - 1];
                    if (lastMsg && lastMsg.type === MessageType.Assist) {
                        const content = typeof lastMsg.content === "string"
                            ? lastMsg.content
                            : lastMsg.content.type === "text"
                                ? lastMsg.content.text
                                : "";
                        return content;
                    }
                    return "Sub-agent completed the task but produced no text response.";
                },
            },
        ];
    }
}

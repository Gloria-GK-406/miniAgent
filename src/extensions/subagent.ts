import { z } from "zod";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Tool, ToolProvider } from "../core/index.js";
import type { Message } from "../core/index.js";
import { MessageType } from "../core/index.js";
import type { MiniAgent } from "../core/index.js";
import {
    AgentCapabilityRuleSchema,
    AgentCapabilitySelectorSchema,
    isCapabilityEnabled,
} from "../core/index.js";
import { parseFrontmatter } from "./frontmatter.js";

export const AgentFactorySchema = z.custom<
    (task: string, systemPrompt: string) => Promise<MiniAgent>
>((value) => typeof value === "function");

export type AgentFactory = z.infer<typeof AgentFactorySchema>;

const SubAgentParamsSchema = z.object({
    task: z.string().meta({ description: "The task description to delegate to the sub-agent" }),
    system_prompt: z.string().optional().meta({ description: "Custom system prompt for the sub-agent" }),
});

export const SubagentCapabilitySelectorSchema = AgentCapabilityRuleSchema;

export type SubagentCapabilitySelector = z.infer<typeof SubagentCapabilitySelectorSchema>;

export const SubagentPluginConfigSchema = z.object({
    path: z.string().default("subagent/"),
    capabilities: SubagentCapabilitySelectorSchema.optional(),
});

export type SubagentPluginConfig = z.infer<typeof SubagentPluginConfigSchema>;
export type SubagentPluginConfigInput = z.input<typeof SubagentPluginConfigSchema>;

export const SubagentDefinitionSchema = z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    description: z.string().optional(),
    model: z.string().optional(),
    capabilities: AgentCapabilitySelectorSchema.optional(),
});

export type SubagentDefinition = z.infer<typeof SubagentDefinitionSchema>;

export const SubagentEntrySchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    prompt: z.string(),
    model: z.string().optional(),
    capabilities: AgentCapabilitySelectorSchema.optional(),
    filePath: z.string(),
});

export type SubagentEntry = z.infer<typeof SubagentEntrySchema>;

export const SubagentInvocationSchema = z.object({
    entry: SubagentEntrySchema,
    task: z.string(),
    context: z.string().optional(),
});

export type SubagentInvocation = z.infer<typeof SubagentInvocationSchema>;

export const ConfiguredSubagentFactorySchema = z.custom<
    (request: SubagentInvocation) => Promise<MiniAgent>
>((value) => typeof value === "function");

export type ConfiguredSubagentFactory = z.infer<
    typeof ConfiguredSubagentFactorySchema
>;

const RunSubagentParamsSchema = z.object({
    agent: z.string().meta({ description: "The subagent id or name to run" }),
    task: z.string().meta({ description: "The task to delegate to the subagent" }),
    context: z.string().optional().meta({ description: "Additional context injected into the subagent task" }),
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
                execute: async (args: Record<string, unknown>, signal?: AbortSignal): Promise<string> => {
                    const parsed = SubAgentParamsSchema.parse(args);
                    if (signal?.aborted) {
                        return "Sub-agent aborted before start.";
                    }

                    const agent = await this.factory(parsed.task, parsed.system_prompt ?? "");

                    const onAbort = (): void => {
                        agent.stop();
                    };
                    let listenerAttached = false;

                    const inputMsg: Message = {
                        id: crypto.randomUUID(),
                        type: MessageType.User,
                        content: parsed.task,
                    };

                    try {
                        if (signal?.aborted) {
                            onAbort();
                            return "Sub-agent aborted before start.";
                        }

                        if (signal) {
                            signal.addEventListener("abort", onAbort, { once: true });
                            listenerAttached = true;
                        }

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
                    } finally {
                        if (listenerAttached && signal !== undefined) {
                            signal.removeEventListener("abort", onAbort);
                        }
                        await agent.destroy();
                    }
                },
            },
        ];
    }
}

export class SubagentPlugin {
    priority = 100;

    private factory: ConfiguredSubagentFactory;
    private entries = new Map<string, SubagentEntry>();
    private config: SubagentPluginConfig;
    private capabilities: SubagentCapabilitySelector;

    constructor(config: SubagentPluginConfigInput, factory: ConfiguredSubagentFactory) {
        const parsed = SubagentPluginConfigSchema.safeParse(config);
        if (!parsed.success) {
            throw new Error(`Invalid subagent plugin config: ${parsed.error.message}`);
        }

        this.config = parsed.data;
        this.capabilities = parsed.data.capabilities ?? {};
        this.factory = factory;
    }

    async initialize(): Promise<void> {
        await this.scanAll();
    }

    async collect(): Promise<Message[]> {
        const visibleEntries = this.getVisibleEntries();
        if (visibleEntries.length === 0) {
            return [];
        }

        const lines: string[] = ["<available_subagents>"];
        for (const entry of visibleEntries) {
            lines.push(`- id: ${entry.id}`);
            lines.push(`  name: ${entry.name}`);
            lines.push(`  description: ${entry.description}`);
            if (entry.model !== undefined) {
                lines.push(`  model: ${entry.model}`);
            }
        }
        lines.push("</available_subagents>");
        lines.push("");
        lines.push("Use the run_subagent tool to delegate work to one of these configured subagents.");

        return [{
            id: crypto.randomUUID(),
            type: MessageType.System,
            content: lines.join("\n"),
        }];
    }

    async getTools(): Promise<Tool[]> {
        const visibleEntries = this.getVisibleEntries();
        if (visibleEntries.length === 0) {
            return [];
        }

        return [{
            name: "run_subagent",
            description:
                "Run a configured subagent by id or name. "
                + "Use this when a specialized delegated agent should handle a task synchronously.",
            parameters: RunSubagentParamsSchema,
            execute: async (args: Record<string, unknown>, signal?: AbortSignal): Promise<string> => {
                const parsed = RunSubagentParamsSchema.parse(args);
                const entry = this.resolveEntry(parsed.agent, visibleEntries);
                if (!entry) {
                    const available = visibleEntries.map((item) => item.id).join(", ");
                    return `Subagent "${parsed.agent}" not found. Available subagents: ${available}`;
                }

                if (signal?.aborted) {
                    return [
                        `<subagent_result id="${entry.id}" name="${entry.name}">`,
                        "Subagent aborted before start.",
                        "</subagent_result>",
                    ].join("\n");
                }

                const agent = await this.factory({
                    entry,
                    task: parsed.task,
                    ...(parsed.context !== undefined && { context: parsed.context }),
                });

                const onAbort = (): void => {
                    agent.stop();
                };
                let listenerAttached = false;

                const inputMsg: Message = {
                    id: crypto.randomUUID(),
                    type: MessageType.User,
                    content: buildSubagentInput(parsed.task, parsed.context),
                };

                try {
                    if (signal?.aborted) {
                        onAbort();
                        return [
                            `<subagent_result id="${entry.id}" name="${entry.name}">`,
                            "Subagent aborted before start.",
                            "</subagent_result>",
                        ].join("\n");
                    }

                    if (signal) {
                        signal.addEventListener("abort", onAbort, { once: true });
                        listenerAttached = true;
                    }

                    const messages = await agent.run(inputMsg);
                    const finalMessage = getFinalMessageText(messages);
                    return [
                        `<subagent_result id="${entry.id}" name="${entry.name}">`,
                        finalMessage,
                        "</subagent_result>",
                    ].join("\n");
                } finally {
                    if (listenerAttached && signal !== undefined) {
                        signal.removeEventListener("abort", onAbort);
                    }
                    await agent.destroy();
                }
            },
        }];
    }

    private getVisibleEntries(): SubagentEntry[] {
        return [...this.entries.values()].filter((entry) =>
            isCapabilityEnabled(entry.id, this.capabilities),
        );
    }

    private resolveEntry(agent: string, visibleEntries: SubagentEntry[]): SubagentEntry | undefined {
        return visibleEntries.find((entry) => entry.id === agent || entry.name === agent);
    }

    private async scanAll(): Promise<void> {
        const root = this.config.path.startsWith("~/")
            ? path.join(os.homedir(), this.config.path.slice(2))
            : path.resolve(this.config.path);

        this.entries.clear();
        await this.scanDirectory(root);
    }

    private async scanDirectory(dirPath: string): Promise<void> {
        let dirEntries: Dirent[];
        try {
            dirEntries = await fs.readdir(dirPath, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of dirEntries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                await this.scanDirectory(fullPath);
                continue;
            }

            if (!entry.isFile() || !entry.name.endsWith(".md")) {
                continue;
            }

            const raw = await fs.readFile(fullPath, "utf-8").catch(() => null);
            if (raw === null) {
                continue;
            }

            const parsed = this.parseMarkdown(raw, fullPath);
            if (!parsed) {
                continue;
            }
            this.entries.set(parsed.id, parsed);
        }
    }

    private parseMarkdown(raw: string, filePath: string): SubagentEntry | null {
        const { data, content } = parseFrontmatter(raw);
        const prompt = content.trim();
        if (prompt.length === 0) {
            return null;
        }

        const result = SubagentDefinitionSchema.safeParse(data);
        if (!result.success) {
            return null;
        }

        return {
            id: result.data.id,
            name: result.data.name ?? result.data.id,
            description: result.data.description ?? "",
            prompt,
            ...(result.data.model !== undefined && { model: result.data.model }),
            ...(result.data.capabilities !== undefined && { capabilities: result.data.capabilities }),
            filePath,
        };
    }
}

function buildSubagentInput(task: string, context: string | undefined): string {
    if (context === undefined || context.trim().length === 0) {
        return task;
    }

    return [
        task,
        "",
        "<injected_context>",
        context,
        "</injected_context>",
    ].join("\n");
}

function getFinalMessageText(messages: Message[]): string {
    for (let index = messages.length - 1; index >= 0; index--) {
        const candidate = messages[index]!;
        if (candidate.type !== MessageType.Assist) {
            continue;
        }
        const text = extractMessageText(candidate);
        if (text.length > 0) {
            return text;
        }
    }

    const last = messages[messages.length - 1];
    if (!last) {
        return "Subagent completed with no messages.";
    }

    const fallback = extractMessageText(last);
    if (fallback.length > 0) {
        return fallback;
    }

    return `Subagent completed. Last message type: ${last.type}`;
}

function extractMessageText(message: Message): string {
    if (typeof message.content === "string") {
        return message.content;
    }
    if (message.content.type === "text") {
        return message.content.text;
    }
    return "";
}

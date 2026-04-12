import { z } from "zod";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Tool, ToolProvider } from "./types.js";
import type { Message } from "../core/types.js";
import { MessageType } from "../core/types.js";
import type { MiniAgent } from "../core/agent.js";
import type { AgentConfig } from "../core/config.js";
import {
    AgentCapabilityRuleSchema,
    AgentCapabilitySelectorSchema,
    getCapabilityNamespace,
    isCapabilityEnabled,
} from "../core/capability.js";
import type { AgentCapabilitySelector } from "../core/capability.js";
import { parseFrontmatter } from "../utils/frontmatter.js";

export type AgentFactory = (task: string, systemPrompt: string) => Promise<MiniAgent>;
export type ConfiguredSubagentFactory = (request: SubagentInvocation) => Promise<MiniAgent>;

const SubAgentParamsSchema = z.object({
    task: z.string().describe("The task description to delegate to the sub-agent"),
    system_prompt: z.string().optional().describe("Custom system prompt for the sub-agent"),
});

export const SubagentPluginConfigSchema = z.object({
    path: z.string().default("subagent/"),
});

export type SubagentPluginConfig = z.infer<typeof SubagentPluginConfigSchema>;

export const SubagentCapabilitySelectorSchema = AgentCapabilityRuleSchema;

export type SubagentCapabilitySelector = z.infer<typeof SubagentCapabilitySelectorSchema>;

export const SubagentDefinitionSchema = z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    description: z.string().optional(),
    model: z.string().optional(),
    capabilities: AgentCapabilitySelectorSchema.optional(),
});

export type SubagentDefinition = z.infer<typeof SubagentDefinitionSchema>;

export interface SubagentEntry {
    id: string;
    name: string;
    description: string;
    prompt: string;
    model?: string;
    capabilities?: AgentCapabilitySelector;
    filePath: string;
}

export interface SubagentInvocation {
    entry: SubagentEntry;
    task: string;
    context?: string;
}

const RunSubagentParamsSchema = z.object({
    agent: z.string().describe("The subagent id or name to run"),
    task: z.string().describe("The task to delegate to the subagent"),
    context: z.string().optional().describe("Additional context injected into the subagent task"),
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

export class SubagentPlugin {
    priority = 100;

    private factory: ConfiguredSubagentFactory;
    private entries = new Map<string, SubagentEntry>();
    private config: SubagentPluginConfig | null = null;
    private capabilities: SubagentCapabilitySelector = {};

    constructor(factory: ConfiguredSubagentFactory) {
        this.factory = factory;
    }

    async consumeAgentCapabilities(capabilities: AgentCapabilitySelector): Promise<void> {
        const raw = getCapabilityNamespace(capabilities, "subagent");
        if (raw === undefined) {
            this.capabilities = {};
            return;
        }

        const parsed = SubagentCapabilitySelectorSchema.safeParse(raw);
        if (!parsed.success) {
            throw new Error(`Invalid subagent capability selector: ${parsed.error.message}`);
        }

        this.capabilities = parsed.data;
    }

    async setConfig(agentConfig: AgentConfig): Promise<void> {
        const pluginConfig = agentConfig.plugins.get("subagent");
        if (pluginConfig === undefined || pluginConfig === null) {
            this.config = null;
            this.entries.clear();
            return;
        }

        const parsed = SubagentPluginConfigSchema.safeParse(pluginConfig);
        if (!parsed.success) {
            throw new Error(`Invalid subagent plugin config: ${parsed.error.message}`);
        }

        const nextConfig = parsed.data;
        if (this.config && JSON.stringify(this.config) !== JSON.stringify(nextConfig)) {
            this.entries.clear();
        }

        this.config = nextConfig;
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
            execute: async (args: Record<string, unknown>): Promise<string> => {
                const parsed = RunSubagentParamsSchema.parse(args);
                const entry = this.resolveEntry(parsed.agent, visibleEntries);
                if (!entry) {
                    const available = visibleEntries.map((item) => item.id).join(", ");
                    return `Subagent "${parsed.agent}" not found. Available subagents: ${available}`;
                }

                const agent = await this.factory({
                    entry,
                    task: parsed.task,
                    ...(parsed.context !== undefined && { context: parsed.context }),
                });

                const inputMsg: Message = {
                    id: crypto.randomUUID(),
                    type: MessageType.User,
                    content: buildSubagentInput(parsed.task, parsed.context),
                };

                const messages = await agent.run(inputMsg);
                const finalMessage = getFinalMessageText(messages);
                return [
                    `<subagent_result id="${entry.id}" name="${entry.name}">`,
                    finalMessage,
                    "</subagent_result>",
                ].join("\n");
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
        if (!this.config) {
            return;
        }

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

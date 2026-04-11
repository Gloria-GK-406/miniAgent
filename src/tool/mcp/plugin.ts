import type { Tool } from "../types.js";
import type { AgentConfig } from "../../core/config.js";
import { McpClient } from "./client.js";
import { convertMcpTool } from "./convert.js";
import { McpPluginConfigSchema } from "./types.js";
import type { McpPluginConfig } from "./types.js";

export class McpPlugin {
    private clients = new Map<string, McpClient>();
    private cachedTools: Tool[] = [];
    private config: McpPluginConfig | null = null;

    async setConfig(agentConfig: AgentConfig): Promise<void> {
        const pluginConfig = agentConfig.plugins.get("mcp");
        if (pluginConfig === undefined || pluginConfig === null) {
            await this.disconnectAll();
            this.config = null;
            this.cachedTools = [];
            return;
        }

        const parsed = McpPluginConfigSchema.safeParse(pluginConfig);
        if (!parsed.success) {
            throw new Error(`Invalid MCP plugin config: ${parsed.error.message}`);
        }

        const newConfig = parsed.data;

        if (this.config && this.configChanged(this.config, newConfig)) {
            await this.disconnectAll();
        }

        this.config = newConfig;
        await this.connectAll();
    }

    async getTools(): Promise<Tool[]> {
        return this.cachedTools;
    }

    async destroy(): Promise<void> {
        await this.disconnectAll();
    }

    private configChanged(old: McpPluginConfig, next: McpPluginConfig): boolean {
        return JSON.stringify(old) !== JSON.stringify(next);
    }

    private async connectAll(): Promise<void> {
        if (!this.config) {
            return;
        }

        const tools: Tool[] = [];
        const serverEntries = Object.entries(this.config.servers);

        await Promise.allSettled(
            serverEntries.map(async ([name, serverConfig]) => {
                const client = new McpClient(name, serverConfig);
                try {
                    await client.connect();
                    this.clients.set(name, client);

                    const mcpTools = await client.listTools();
                    for (const entry of mcpTools) {
                        tools.push(convertMcpTool(name, entry, client));
                    }
                } catch (e) {
                    console.error(`Failed to connect MCP server "${name}":`, e);
                }
            }),
        );

        this.cachedTools = tools;
    }

    private async disconnectAll(): Promise<void> {
        await Promise.allSettled(
            [...this.clients.values()].map((client) => client.disconnect()),
        );
        this.clients.clear();
    }
}

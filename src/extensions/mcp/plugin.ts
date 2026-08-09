import type { Tool } from "../../core/index.js";
import { McpClient } from "./client.js";
import { convertMcpTool, prefixToolName } from "./convert.js";
import { isCapabilityEnabled } from "../../core/index.js";
import { McpPluginConfigSchema } from "./types.js";
import type { McpCapabilitySelector, McpPluginConfig, McpPluginConfigInput } from "./types.js";

export class McpPlugin {
    private clients = new Map<string, McpClient>();
    private cachedTools: Tool[] = [];
    private config: McpPluginConfig;
    private capabilities: McpCapabilitySelector;

    constructor(config: McpPluginConfigInput) {
        const parsed = McpPluginConfigSchema.safeParse(config);
        if (!parsed.success) {
            throw new Error(`Invalid MCP plugin config: ${parsed.error.message}`);
        }

        this.config = parsed.data;
        this.capabilities = parsed.data.capabilities ?? {};
    }

    async initialize(): Promise<void> {
        await this.disconnectAll();
        this.cachedTools = [];
        await this.connectAll();
    }

    async getTools(): Promise<Tool[]> {
        return this.cachedTools;
    }

    async destroy(): Promise<void> {
        await this.disconnectAll();
        this.cachedTools = [];
    }

    private async connectAll(): Promise<void> {
        const tools: Tool[] = [];
        const serverEntries = Object.entries(this.config.servers);

        await Promise.allSettled(
            serverEntries.map(async ([name, serverConfig]) => {
                if (!isCapabilityEnabled(name, this.capabilities.server)) {
                    return;
                }

                const client = new McpClient(name, serverConfig);
                try {
                    await client.connect();
                    this.clients.set(name, client);

                    const mcpTools = await client.listTools();
                    for (const entry of mcpTools) {
                        const prefixedName = prefixToolName(name, entry.name);
                        if (!isCapabilityEnabled(prefixedName, this.capabilities.tool)) {
                            continue;
                        }
                        tools.push(convertMcpTool(name, entry, client));
                    }
                } catch (e) {
                    await client.disconnect().catch(() => {});
                    this.clients.delete(name);
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

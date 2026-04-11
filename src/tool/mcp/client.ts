import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpServerConfig } from "./types.js";

export interface McpToolEntry {
    name: string;
    description?: string;
    inputSchema: {
        type: "object";
        properties?: Record<string, object>;
        required?: string[];
        [key: string]: unknown;
    };
}

export class McpClient {
    private client: Client;
    private transport: Transport | null = null;
    private connected = false;

    constructor(
        private serverName: string,
        private config: McpServerConfig,
    ) {
        this.client = new Client(
            { name: "miniagent-mcp-client", version: "1.0.0" },
            { capabilities: {} },
        );
    }

    async connect(): Promise<void> {
        this.transport = this.createTransport();
        await this.client.connect(this.transport);
        this.connected = true;
    }

    async disconnect(): Promise<void> {
        if (this.connected) {
            await this.client.close();
            this.connected = false;
        }
        this.transport = null;
    }

    async listTools(): Promise<McpToolEntry[]> {
        if (!this.connected) {
            throw new Error(`MCP server "${this.serverName}" is not connected`);
        }
        const result = await this.client.listTools();
        return result.tools as McpToolEntry[];
    }

    async callTool(name: string, args: Record<string, unknown>): Promise<string> {
        if (!this.connected) {
            throw new Error(`MCP server "${this.serverName}" is not connected`);
        }
        const result = await this.client.callTool({ name, arguments: args });
        return this.extractText(result);
    }

    get isConnected(): boolean {
        return this.connected;
    }

    private createTransport(): Transport {
        switch (this.config.transport) {
            case "stdio": {
                const params: { command: string; args?: string[]; env?: Record<string, string> } = {
                    command: this.config.command,
                };
                if (this.config.args !== undefined) {
                    params.args = this.config.args;
                }
                if (this.config.env !== undefined) {
                    params.env = this.config.env;
                }
                return new StdioClientTransport(params);
            }
            case "sse":
                return new SSEClientTransport(new URL(this.config.url));
            case "streamable-http":
                return new StreamableHTTPClientTransport(new URL(this.config.url)) as Transport;
        }
    }

    private extractText(result: Record<string, unknown>): string {
        const content = result["content"] as Array<Record<string, unknown>> | undefined;
        if (!content || content.length === 0) {
            return "";
        }
        return content
            .map((item) => {
                if (item["type"] === "text" && typeof item["text"] === "string") {
                    return item["text"];
                }
                if (item["type"] === "image" && typeof item["data"] === "string") {
                    return `[image: ${typeof item["mimeType"] === "string" ? item["mimeType"] : "unknown"}]`;
                }
                if (item["type"] === "resource") {
                    const resource = item["resource"];
                    if (typeof resource === "object" && resource !== null) {
                        const text = (resource as Record<string, unknown>)["text"];
                        if (typeof text === "string") {
                            return text;
                        }
                    }
                    return "[resource]";
                }
                return JSON.stringify(item);
            })
            .join("\n");
    }
}

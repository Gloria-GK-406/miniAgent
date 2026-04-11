import { z } from "zod";
import type { Tool } from "../types.js";
import type { McpClient, McpToolEntry } from "./client.js";
import type { McpToolInfo } from "./types.js";

export const MCP_TOOL_PREFIX = "mcp__";

export function prefixToolName(serverName: string, toolName: string): string {
    return `${MCP_TOOL_PREFIX}${serverName}__${toolName}`;
}

export function parsePrefixedName(prefixed: string): McpToolInfo | null {
    if (!prefixed.startsWith(MCP_TOOL_PREFIX)) {
        return null;
    }
    const rest = prefixed.slice(MCP_TOOL_PREFIX.length);
    const sep = rest.indexOf("__");
    if (sep === -1) {
        return null;
    }
    return {
        serverName: rest.slice(0, sep),
        originalName: rest.slice(sep + 2),
        prefixedName: prefixed,
    };
}

const passthroughSchema = z.record(z.unknown());

export function convertMcpTool(
    serverName: string,
    entry: McpToolEntry,
    client: McpClient,
): Tool {
    const prefixedName = prefixToolName(serverName, entry.name);
    return {
        name: prefixedName,
        description: entry.description ?? "",
        parameters: passthroughSchema,
        execute: async (args: Record<string, unknown>): Promise<string> => {
            try {
                return await client.callTool(entry.name, args);
            } catch (e: unknown) {
                return e instanceof Error ? e.message : String(e);
            }
        },
    };
}

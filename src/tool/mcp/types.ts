import { z } from "zod";

export const McpStdioConfigSchema = z.object({
    transport: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
});

export type McpStdioConfig = z.infer<typeof McpStdioConfigSchema>;

export const McpSseConfigSchema = z.object({
    transport: z.literal("sse"),
    url: z.string(),
});

export type McpSseConfig = z.infer<typeof McpSseConfigSchema>;

export const McpStreamableHttpConfigSchema = z.object({
    transport: z.literal("streamable-http"),
    url: z.string(),
});

export type McpStreamableHttpConfig = z.infer<typeof McpStreamableHttpConfigSchema>;

export const McpServerConfigSchema = z.union([
    McpStdioConfigSchema,
    McpSseConfigSchema,
    McpStreamableHttpConfigSchema,
]);

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const McpPluginConfigSchema = z.object({
    servers: z.record(McpServerConfigSchema),
});

export type McpPluginConfig = z.infer<typeof McpPluginConfigSchema>;

export interface McpToolInfo {
    serverName: string;
    originalName: string;
    prefixedName: string;
}

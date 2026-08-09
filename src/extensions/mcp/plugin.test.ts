import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpPlugin } from "./plugin.js";
import type { McpCapabilitySelector, McpPluginConfig } from "./types.js";

interface MockClient {
    serverName: string;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    listTools: ReturnType<typeof vi.fn>;
    callTool: ReturnType<typeof vi.fn>;
}

const mockClients: MockClient[] = [];

let defaultTools = [{
    name: "read_file",
    description: "Read file",
    inputSchema: { type: "object" },
}];

const failServers: Set<string> = new Set();

vi.mock("./client.js", () => ({
    McpClient: class McpClientMock {
        serverName: string;
        connect = vi.fn(async () => {
            if (failServers.has(this.serverName)) {
                throw new Error("connect fail");
            }
        });
        disconnect = vi.fn(async () => {});
        listTools = vi.fn(async () => [...defaultTools]);
        callTool = vi.fn(async () => "");

        constructor(serverName: string) {
            this.serverName = serverName;
            mockClients.push(this as unknown as MockClient);
        }
    },
}));

function makeConfig(
    servers: Record<string, object>,
    capabilities?: McpCapabilitySelector,
): McpPluginConfig {
    return {
        servers: servers as McpPluginConfig["servers"],
        ...(capabilities !== undefined && { capabilities }),
    };
}

describe("McpPlugin", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClients.length = 0;
        failServers.clear();
        defaultTools = [{
            name: "read_file",
            description: "Read file",
            inputSchema: { type: "object" },
        }];
    });

    it("returns empty tools when no servers are configured", async () => {
        const plugin = new McpPlugin({ servers: {} });
        await plugin.initialize();
        const tools = await plugin.getTools();
        expect(tools).toEqual([]);
    });

    it("throws on invalid config", async () => {
        expect(() => new McpPlugin({ bad: true } as unknown as McpPluginConfig))
            .toThrow("Invalid MCP plugin config");
    });

    it("connects to servers and collects tools", async () => {
        const config = makeConfig({
            fs: { transport: "stdio", command: "npx", args: ["-y", "fs-server"] },
        });
        const plugin = new McpPlugin(config);
        await plugin.initialize();

        expect(mockClients).toHaveLength(1);
        expect(mockClients[0]!.connect).toHaveBeenCalledOnce();
        expect(mockClients[0]!.serverName).toBe("fs");
    });

    it("lists and converts tools from connected servers", async () => {
        const config = makeConfig({
            fs: { transport: "stdio", command: "npx" },
        });
        const plugin = new McpPlugin(config);
        await plugin.initialize();

        const tools = await plugin.getTools();
        expect(tools).toHaveLength(1);
        expect(tools[0]!.name).toBe("mcp__fs__read_file");
        expect(tools[0]!.description).toBe("Read file");
    });

    it("handles server connection failure gracefully", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        failServers.add("bad");

        const config = makeConfig({
            bad: { transport: "stdio", command: "fail" },
            good: { transport: "stdio", command: "ok" },
        });
        const plugin = new McpPlugin(config);
        await plugin.initialize();

        expect(consoleSpy).toHaveBeenCalled();
        expect(mockClients.find((c) => c.serverName === "good")).toBeDefined();
        consoleSpy.mockRestore();
    });

    it("disconnects a client when connect fails", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        failServers.add("bad");

        const plugin = new McpPlugin(makeConfig({
            bad: { transport: "stdio", command: "fail" },
        }));
        await plugin.initialize();

        expect(mockClients).toHaveLength(1);
        expect(mockClients[0]!.disconnect).toHaveBeenCalledOnce();
        consoleSpy.mockRestore();
    });

    it("disconnects all clients on destroy", async () => {
        const config = makeConfig({
            fs: { transport: "stdio", command: "npx" },
        });
        const plugin = new McpPlugin(config);
        await plugin.initialize();

        const client = mockClients[0]!;
        await plugin.destroy();
        expect(client.disconnect).toHaveBeenCalled();
    });

    it("clears cached tools on destroy", async () => {
        const plugin = new McpPlugin(makeConfig({
            fs: { transport: "stdio", command: "npx" },
        }));
        await plugin.initialize();
        expect(await plugin.getTools()).toHaveLength(1);

        await plugin.destroy();

        expect(await plugin.getTools()).toEqual([]);
    });

    it("reinitializes by disconnecting existing clients before reconnecting", async () => {
        const plugin = new McpPlugin(makeConfig({
            fs: { transport: "stdio", command: "npx" },
        }));
        await plugin.initialize();
        const firstClient = mockClients[0]!;

        await plugin.initialize();

        expect(firstClient.disconnect).toHaveBeenCalledOnce();
        expect(mockClients).toHaveLength(2);
        expect(await plugin.getTools()).toHaveLength(1);
    });

    it("filters servers by capability selector", async () => {
        const config = makeConfig(
            {
                good: { transport: "stdio", command: "ok" },
                blocked: { transport: "stdio", command: "nope" },
            },
            {
                server: {
                    allow: ["good"],
                },
            },
        );
        const plugin = new McpPlugin(config);
        await plugin.initialize();

        expect(mockClients).toHaveLength(1);
        expect(mockClients[0]!.serverName).toBe("good");
    });

    it("filters MCP tools by capability selector", async () => {
        defaultTools = [
            {
                name: "read_file",
                description: "Read file",
                inputSchema: { type: "object" },
            },
            {
                name: "write_file",
                description: "Write file",
                inputSchema: { type: "object" },
            },
        ];

        const config = makeConfig(
            {
                fs: { transport: "stdio", command: "npx" },
            },
            {
                tool: {
                    allow: ["mcp__fs__read_file"],
                },
            },
        );
        const plugin = new McpPlugin(config);
        await plugin.initialize();

        const tools = await plugin.getTools();
        expect(tools.map((tool) => tool.name)).toEqual(["mcp__fs__read_file"]);
    });
});

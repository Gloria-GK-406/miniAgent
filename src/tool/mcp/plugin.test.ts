import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpPlugin } from "./plugin.js";
import type { AgentConfig, JsonValue } from "../../core/config.js";

interface MockClient {
    serverName: string;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    listTools: ReturnType<typeof vi.fn>;
    callTool: ReturnType<typeof vi.fn>;
}

const mockClients: MockClient[] = [];

const defaultTools = [{
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

function makeConfig(servers: Record<string, object>): AgentConfig {
    return {
        model: {
            provider: "test",
            model: "test-model",
            apiKey: "key",
        },
        models: new Map(),
        plugins: new Map([["mcp", { servers } as unknown as JsonValue]]),
        paths: { sessiondir: "/tmp" },
    };
}

describe("McpPlugin", () => {
    let plugin: McpPlugin;

    beforeEach(() => {
        vi.clearAllMocks();
        mockClients.length = 0;
        failServers.clear();
        plugin = new McpPlugin();
    });

    it("returns empty tools when no config", async () => {
        const config: AgentConfig = {
            model: { provider: "test", model: "m", apiKey: "k" },
            models: new Map(),
            plugins: new Map(),
            paths: { sessiondir: "/tmp" },
        };
        await plugin.setConfig(config);
        const tools = await plugin.getTools();
        expect(tools).toEqual([]);
    });

    it("returns empty tools when config is null", async () => {
        const config: AgentConfig = {
            model: { provider: "test", model: "m", apiKey: "k" },
            models: new Map(),
            plugins: new Map([["mcp", null]]),
            paths: { sessiondir: "/tmp" },
        };
        await plugin.setConfig(config);
        const tools = await plugin.getTools();
        expect(tools).toEqual([]);
    });

    it("throws on invalid config", async () => {
        const config = makeConfig({});
        config.plugins.set("mcp", { bad: true });
        await expect(plugin.setConfig(config)).rejects.toThrow("Invalid MCP plugin config");
    });

    it("connects to servers and collects tools", async () => {
        const config = makeConfig({
            fs: { transport: "stdio", command: "npx", args: ["-y", "fs-server"] },
        });
        await plugin.setConfig(config);

        expect(mockClients).toHaveLength(1);
        expect(mockClients[0]!.connect).toHaveBeenCalledOnce();
        expect(mockClients[0]!.serverName).toBe("fs");
    });

    it("lists and converts tools from connected servers", async () => {
        const config = makeConfig({
            fs: { transport: "stdio", command: "npx" },
        });
        await plugin.setConfig(config);

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
        await plugin.setConfig(config);

        expect(consoleSpy).toHaveBeenCalled();
        expect(mockClients.find((c) => c.serverName === "good")).toBeDefined();
        consoleSpy.mockRestore();
    });

    it("disconnects all clients on destroy", async () => {
        const config = makeConfig({
            fs: { transport: "stdio", command: "npx" },
        });
        await plugin.setConfig(config);

        const client = mockClients[0]!;
        await plugin.destroy();
        expect(client.disconnect).toHaveBeenCalled();
    });

    it("reconnects when config changes", async () => {
        const config1 = makeConfig({
            fs: { transport: "stdio", command: "v1" },
        });
        await plugin.setConfig(config1);

        const firstClient = mockClients[0]!;
        expect(firstClient.disconnect).not.toHaveBeenCalled();

        const config2 = makeConfig({
            fs: { transport: "stdio", command: "v2" },
        });
        await plugin.setConfig(config2);

        expect(firstClient.disconnect).toHaveBeenCalled();
    });

    it("does not disconnect when config unchanged", async () => {
        const config = makeConfig({
            fs: { transport: "stdio", command: "npx" },
        });
        await plugin.setConfig(config);

        const firstClient = mockClients[0]!;
        await plugin.setConfig(config);

        expect(firstClient.disconnect).not.toHaveBeenCalled();
    });

    it("clears tools when config is set to null after being set", async () => {
        const config = makeConfig({
            fs: { transport: "stdio", command: "npx" },
        });
        await plugin.setConfig(config);
        expect(await plugin.getTools()).toHaveLength(1);

        const noConfig: AgentConfig = {
            model: { provider: "test", model: "m", apiKey: "k" },
            models: new Map(),
            plugins: new Map(),
            paths: { sessiondir: "/tmp" },
        };
        await plugin.setConfig(noConfig);

        const tools = await plugin.getTools();
        expect(tools).toEqual([]);
    });
});

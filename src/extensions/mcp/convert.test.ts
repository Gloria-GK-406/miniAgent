import { describe, it, expect } from "vitest";
import { prefixToolName, parsePrefixedName, convertMcpTool, MCP_TOOL_PREFIX } from "./convert.js";
import type { McpClient, McpToolEntry } from "./client.js";

describe("prefixToolName", () => {
    it("prefixes server and tool name with mcp__ separator", () => {
        expect(prefixToolName("filesystem", "read_file")).toBe("mcp__filesystem__read_file");
    });

    it("handles tool names containing underscores", () => {
        expect(prefixToolName("my_server", "my_tool_name")).toBe("mcp__my_server__my_tool_name");
    });
});

describe("parsePrefixedName", () => {
    it("parses a valid prefixed name", () => {
        const result = parsePrefixedName("mcp__filesystem__read_file");
        expect(result).toEqual({
            serverName: "filesystem",
            originalName: "read_file",
            prefixedName: "mcp__filesystem__read_file",
        });
    });

    it("returns null for non-mcp prefix", () => {
        expect(parsePrefixedName("regular_tool")).toBeNull();
    });

    it("returns null when no double underscore separator after prefix", () => {
        expect(parsePrefixedName("mcp__nosep")).toBeNull();
    });

    it("returns null for empty string", () => {
        expect(parsePrefixedName("")).toBeNull();
    });

    it("handles tool name with multiple double underscores", () => {
        const result = parsePrefixedName("mcp__server__tool__sub");
        expect(result).not.toBeNull();
        expect(result!.serverName).toBe("server");
        expect(result!.originalName).toBe("tool__sub");
    });
});

function createMockClient(callToolImpl?: (name: string, args: Record<string, unknown>) => Promise<string>): McpClient {
    return {
        callTool: callToolImpl ?? (async () => "result text"),
    } as McpClient;
}

describe("convertMcpTool", () => {
    const mockClient = createMockClient();

    const entry: McpToolEntry = {
        name: "read_file",
        description: "Read a file",
        inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
        },
    };

    it("converts entry to Tool with prefixed name", () => {
        const tool = convertMcpTool("fs", entry, mockClient);
        expect(tool.name).toBe("mcp__fs__read_file");
    });

    it("uses entry description", () => {
        const tool = convertMcpTool("fs", entry, mockClient);
        expect(tool.description).toBe("Read a file");
    });

    it("defaults description to empty string when undefined", () => {
        const noDescEntry: McpToolEntry = {
            name: "tool",
            inputSchema: { type: "object" },
        };
        const tool = convertMcpTool("fs", noDescEntry, mockClient);
        expect(tool.description).toBe("");
    });

    it("execute calls client.callTool and returns result", async () => {
        const tool = convertMcpTool("fs", entry, mockClient);
        const result = await tool.execute({ path: "/tmp/test.txt" });
        expect(result).toBe("result text");
    });

    it("execute returns error message on failure", async () => {
        const failClient = createMockClient(async () => {
            throw new Error("connection lost");
        });
        const tool = convertMcpTool("fs", entry, failClient);
        const result = await tool.execute({ path: "/tmp/test.txt" });
        expect(result).toBe("connection lost");
    });

    it("execute handles non-Error throws", async () => {
        const failClient = createMockClient(async () => {
            throw "string error";
        });
        const tool = convertMcpTool("fs", entry, failClient);
        const result = await tool.execute({ path: "/tmp/test.txt" });
        expect(result).toBe("string error");
    });
});

describe("MCP_TOOL_PREFIX", () => {
    it('is "mcp__"', () => {
        expect(MCP_TOOL_PREFIX).toBe("mcp__");
    });
});

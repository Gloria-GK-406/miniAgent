# mcp

Connect to MCP (Model Context Protocol) servers and expose their tools to the agent.

## Setup

```typescript
import { McpPlugin } from "@piaoxianguo/miniagent/extensions/mcp";

const mcp = new McpPlugin({
  servers: {
    filesystem: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    },
  },
});
await mcp.initialize();
agent.register(mcp);
```

## Configuration

Pass MCP server configuration to the plugin constructor:

```json
{
  "servers": {
    "filesystem": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    },
    "remote": {
      "transport": "streamable-http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Transports

| Transport | Fields | Description |
|-----------|--------|-------------|
| `stdio` | `command`, `args?`, `env?` | Spawn a subprocess |
| `sse` | `url` | HTTP SSE connection (legacy) |
| `streamable-http` | `url` | Streamable HTTP (recommended) |

## Behavior

- MCP tools are registered as `mcp__{serverName}__{toolName}` to avoid naming conflicts
- `McpPlugin` implements `ToolProvider`
- Tool list is dynamically rebuilt each turn
- Failed server connections are reported to the console and skipped

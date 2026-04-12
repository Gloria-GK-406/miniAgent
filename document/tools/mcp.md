# mcp

Connect to MCP (Model Context Protocol) servers and expose their tools to the agent.

## Setup

```typescript
import { McpPlugin } from "@piaoxianguo/miniagent/tool/mcp";

const mcp = new McpPlugin();
agent.register(mcp);
```

## Configuration

Configure MCP servers in the agent config's `plugins.mcp`:

```json
{
  "plugins": {
    "mcp": {
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
- `McpPlugin` implements both `ToolProvider` and `ConfigNotifier`
- Tool list is dynamically rebuilt each turn
- Failed server connections are silently skipped

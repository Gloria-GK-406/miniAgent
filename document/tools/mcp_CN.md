# mcp

连接 MCP（Model Context Protocol）服务器，将其工具暴露给 Agent。

## 设置

```typescript
import { McpPlugin } from "@piaoxianguo/miniagent/tool/mcp";

const mcp = new McpPlugin();
agent.register(mcp);
```

## 配置

在 Agent 配置的 `plugins.mcp` 中配置 MCP 服务器：

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

## 传输方式

| 传输方式 | 配置字段 | 说明 |
|-----------|--------|------|
| `stdio` | `command`、`args?`、`env?` | 启动子进程 |
| `sse` | `url` | HTTP SSE 连接（旧版） |
| `streamable-http` | `url` | Streamable HTTP（推荐） |

## 行为

- MCP 工具以 `mcp__{serverName}__{toolName}` 格式注册，避免命名冲突
- `McpPlugin` 同时实现 `ToolProvider` 和 `ConfigNotifier`
- 每个 turn 动态重建工具列表
- 连接失败的服务器会被静默跳过

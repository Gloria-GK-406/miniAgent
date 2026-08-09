# mcp

连接 MCP（Model Context Protocol）服务器，将其工具暴露给 Agent。

## 设置

```typescript
import { McpPlugin } from "@piaoxianguo/miniagent-extensions/mcp";

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

## 配置

将 MCP 服务器配置传给插件构造函数：

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

## 传输方式

| 传输方式 | 配置字段 | 说明 |
|-----------|--------|------|
| `stdio` | `command`、`args?`、`env?` | 启动子进程 |
| `sse` | `url` | HTTP SSE 连接（旧版） |
| `streamable-http` | `url` | Streamable HTTP（推荐） |

## 行为

- MCP 工具以 `mcp__{serverName}__{toolName}` 格式注册，避免命名冲突
- `McpPlugin` 实现 `ToolProvider`
- 每个 turn 动态重建工具列表
- 连接失败的服务器会输出到控制台并被跳过

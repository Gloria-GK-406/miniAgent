# MiniAgent

精简的 TypeScript Agent 框架。简单、可扩展。

## 特性

- **精简核心** — 单一 `MiniAgent` 类，注册即用
- **可扩展的 LLM 引擎** — 内置 Anthropic / OpenAI / OpenAI 兼容协议 / 智谱 GLM，可自定义
- **流式响应** — 原生 streaming 支持，实时获取生成内容
- **工具系统** — 注册工具函数，Agent 自动调用
- **上下文管理** — ContextProvider / ContextProcessor / ContextCompressor 灵活控制上下文窗口
- **消息持久化** — 内置 JSONL 消息存储，支持历史加载与水位线丢弃
- **工具审批** — HITL（Human-in-the-Loop）机制，执行前人工确认
- **事件系统** — 基于 EventEmitter 的完整生命周期事件
- **MCP 插件** — 内置 Model Context Protocol 客户端，支持 stdio / SSE / Streamable HTTP 传输

## 安装

```bash
npm install @piaoxianguo/miniagent
```

## 快速开始

```typescript
import { MiniAgent, LLMEngineManager, MessageType } from "@piaoxianguo/miniagent";
import { AnthropicEngine } from "@piaoxianguo/miniagent/engine/anthropic";

const engines = new LLMEngineManager();
engines.register("anthropic", AnthropicEngine);

const agent = new MiniAgent(engines, {
  model: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY!,
    baseUrl: "",
  },
  paths: {
    sessiondir: "./sessions",
  },
});

agent.on("llm:chunk", ({ chunk }) => {
  if (chunk.type === "text-delta") process.stdout.write(chunk.text);
});

agent.register({
  name: "get_weather",
  description: "获取指定城市的天气",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "城市名称" },
    },
    required: ["city"],
  },
  execute: async (args) => `${args.city}：晴，25°C`,
});

const messages = await agent.run({
  id: crypto.randomUUID(),
  type: MessageType.User,
  content: "北京今天天气怎么样？",
});
```

## 核心概念

### MiniAgent

框架核心类，通过 `register()` 注册各类组件：

```typescript
const agent = new MiniAgent(llmRequest, config);

agent.register(tool);           // 工具
agent.register(toolProvider);   // 工具提供者
agent.register(contextProvider); // 上下文提供者
agent.register(contextProcessor); // 上下文处理器
agent.register(compressor);     // 上下文压缩器
agent.register(errorHandler);   // 错误处理器
agent.register(approver);       // 工具审批器
```

### LLM 引擎

通过 `LLMEngineManager` 管理多个 LLM 引擎，按 `provider` 字符串分发：

```typescript
import { LLMEngineManager } from "@piaoxianguo/miniagent";

const engines = new LLMEngineManager();
engines.register("anthropic", AnthropicEngine);
engines.register("openai", OpenAIEngine);
engines.register("openai-compatible", OpenAICompatibleEngine);
```

### 工具

工具是符合 `Tool` 接口的对象：

```typescript
const tool: Tool = {
  name: "search",
  description: "搜索网页",
  parameters: { /* JSON Schema */ },
  execute: async (args) => { /* 返回字符串结果 */ },
};
```

### 上下文压缩

内置 `ContextCompressor`，在消息数量超过阈值时自动压缩历史：

```typescript
import { ContextCompressor } from "@piaoxianguo/miniagent";

const compressor = new ContextCompressor(engines, modelConfig, {
  maxMessages: 50,
  keepRecent: 10,
});
```

### 事件

```typescript
agent.on("llm:chunk", ({ chunk }) => { /* 流式输出 */ });
agent.on("llm:response", ({ response }) => { /* 完整响应 */ });
agent.on("tool:execute", ({ toolCall }) => { /* 工具调用开始 */ });
agent.on("run:complete", ({ messages }) => { /* 运行结束 */ });
agent.on("run:error", ({ error }) => { /* 错误处理 */ });
```

### 工具审批

实现 `ToolApprover` 接口即可在工具执行前进行人工确认：

```typescript
const approver: ToolApprover = {
  async requestApproval(toolName, args) {
    const answer = await askUser(`允许执行 ${toolName}?`);
    return answer ? "approve" : "deny";
  },
};
agent.register(approver);
```

### MCP 插件

内置 `McpPlugin`，自动连接 MCP 服务器并将其工具暴露给 Agent：

```typescript
import { McpPlugin } from "@piaoxianguo/miniagent/tool/mcp";

const mcp = new McpPlugin();
agent.register(mcp);
```

在配置文件的 `plugins.mcp` 中声明 MCP 服务器：

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

支持三种传输方式：

| 传输 | 配置字段 | 说明 |
|------|---------|------|
| `stdio` | `command`, `args?`, `env?` | 启动子进程通信 |
| `sse` | `url` | HTTP SSE 连接（旧版） |
| `streamable-http` | `url` | Streamable HTTP（推荐） |

MCP 工具会以 `mcp__{serverName}__{toolName}` 格式注册，避免命名冲突。`McpPlugin` 同时实现 `ToolProvider` 和 `ConfigNotifier`，每个 turn 动态构建可用工具列表——连接失败的 server 其工具不会出现在当前 turn 中。

## 技术栈

- TypeScript (strict, ESM)
- Zod schema 验证
- Vitest 测试
- 支持 Anthropic / OpenAI / OpenAI 兼容协议 / 智谱 GLM / MCP

## License

MIT

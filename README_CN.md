# MiniAgent

精简的 TypeScript Agent 框架。默认简单，需要时强大。

[English](./README.md)

## 设计哲学

MiniAgent 围绕几个核心理念构建：

- **单一入口** — 一个 `MiniAgent` 类，统一的 `register()` API。没有复杂的配置层级，没有样板代码。
- **Schema 驱动类型** — 所有数据结构用 Zod schema 定义，TypeScript 类型自动推导，运行时验证免费获得。
- **插件优于框架** — 核心只做好一件事（Agent 循环）。其他一切——工具、上下文提供者、处理器、MCP、技能、子 Agent——都是通过同一个 `register()` 方法注册的可插拔组件。
- **自动检测** — 组件通过 Zod schema 验证识别，而非手动类型标签。注册工具、提供者或处理器——Agent 知道它是什么。

## Hooks（钩子）

框架在 Agent 循环的每一层都暴露扩展钩子：

### 组件注册

一切通过 `register()`。Agent 自动检测组件类型：

```typescript
agent.register(tool);              // Tool
agent.register(toolProvider);      // ToolProvider
agent.register(contextProvider);   // ContextProvider
agent.register(contextProcessor);  // ContextProcessor
agent.register(messageNotifier);   // MessageNotifier
agent.register(errorHandler);      // ErrorHandler
agent.register(afterTurnProcessor);// AfterTurnProcessor
agent.register(configNotifier);    // ConfigNotifier
agent.register(persistRequire);    // PersistRequire
agent.register(turnContextAware);  // TurnContextAware
agent.register(turnContextAppend); // TurnContextAppend
agent.register(approver);          // ToolApprover
agent.register(agentModule);       // AgentModule
```

### ContextProvider

注入额外的上下文消息（按 `priority` 排序）：

```typescript
const provider = {
  priority: 0,
  async collect() {
    return [
      { id: crypto.randomUUID(), type: MessageType.System, content: "自定义上下文" },
    ];
  },
};
```

### ContextProcessor

在发送给 LLM 之前转换消息列表。返回 `Action` 对象：

```typescript
import { ActionType } from "@piaoxianguo/miniagent";

const processor = {
  priority: 100,
  async process(messages) {
    return [
      { type: ActionType.Delete, targetId: "old-message-id" },
      { type: ActionType.Replace, targetId: "msg-id", message: newMessage },
      { type: ActionType.AddFirst, message: systemMsg },
      { type: ActionType.AddLast, message: footerMsg },
    ];
  },
};
```

### 事件

通过 `EventEmitter` 提供完整生命周期事件：

```typescript
agent.on("run:start", ({ input }) => { /* Agent 运行开始 */ });
agent.on("run:complete", ({ messages }) => { /* Agent 运行完成 */ });
agent.on("run:stop", () => { /* Agent 被停止 */ });
agent.on("run:error", ({ error, turn }) => { /* 未处理的错误 */ });
agent.on("turn:start", ({ turn }) => { /* 新 turn 开始 */ });
agent.on("turn:end", ({ turn }) => { /* turn 结束 */ });
agent.on("llm:request", ({ context, tools }) => { /* 即将发起 LLM 请求 */ });
agent.on("llm:chunk", ({ chunk }) => { /* 收到流式块 */ });
agent.on("llm:response", ({ response }) => { /* 收到完整 LLM 响应 */ });
agent.on("tool:execute", ({ toolCall }) => { /* 工具执行开始 */ });
agent.on("tool:result", ({ toolCall, result }) => { /* 工具执行完成 */ });
agent.on("message:notify", ({ message }) => { /* 新消息创建 */ });
```

### 工具审批（HITL）

实现 `ToolApprover` 以在工具执行前添加人工确认：

```typescript
const approver = {
  async requestApproval(toolName, args) {
    const answer = await askUser(`允许执行 ${toolName}?`);
    if (answer === "always") return "approve_all";
    return answer ? "approve" : "deny";
  },
};
agent.register(approver);
agent.setAutoApprovedTools(["read", "glob", "grep"]);
```

### 错误处理

注册 `ErrorHandler` 组件以处理 Agent 循环内的错误：

```typescript
const handler = {
  priority: 0,
  canHandle(error) {
    return error instanceof RateLimitError;
  },
  async handle(error) {
    await delay(5000);
  },
};
agent.register(handler);
```

从任何组件抛出 `StopException` 可优雅停止 Agent 循环：

```typescript
import { StopException } from "@piaoxianguo/miniagent";
throw new StopException("任务完成");
```

### 蓝图装配

从声明式蓝图构建 Agent：

```typescript
import { AgentAssembler, AgentBlueprintRegistry } from "@piaoxianguo/miniagent";

const registry = new AgentBlueprintRegistry();
registry.register("tool.read", () => readTool);
registry.register("plugin.mcp", () => new McpPlugin());

const assembler = new AgentAssembler(registry);
const agent = await assembler.assemble({
  llm: engines,
  config: agentConfig,
  blueprint: { uses: ["tool.read", "plugin.mcp"] },
  capabilities: { tool: { deny: ["bash"] } },
});
```

### 能力系统

通过 allow/deny 模式控制工具、插件和子 Agent 的可见性：

```typescript
const capabilities = {
  tool: { allow: ["read", "glob", "grep"], deny: ["bash"] },
  mcp: {
    server: { allow: ["filesystem"] },
    tool: { deny: ["mcp__filesystem__write_file"] },
  },
  skill: { allow: ["*"] },
  subagent: { deny: ["dangerous-agent"] },
};
```

## 快速开始

### 安装

```bash
npm install @piaoxianguo/miniagent
```

### 直接使用类

```typescript
import { MiniAgent, LLMEngineManager, MessageType } from "@piaoxianguo/miniagent";
import { AnthropicEngine } from "@piaoxianguo/miniagent/engine/anthropic";
import { z } from "zod";

const engines = new LLMEngineManager();
engines.register("anthropic", AnthropicEngine);

const agent = new MiniAgent(engines, {
  model: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY!,
    baseUrl: "",
  },
  models: new Map(),
  plugins: new Map(),
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
  parameters: z.object({
    city: z.string().describe("城市名称"),
  }),
  execute: async (args) => `${args.city}：晴，25°C`,
});

const messages = await agent.run({
  id: crypto.randomUUID(),
  type: MessageType.User,
  content: "北京今天天气怎么样？",
});
```

### 使用工厂函数

```typescript
import { createMiniAgent, LLMEngineManager } from "@piaoxianguo/miniagent";
import { AnthropicEngine } from "@piaoxianguo/miniagent/engine/anthropic";

const engines = new LLMEngineManager();
engines.register("anthropic", AnthropicEngine);

const agent = createMiniAgent({
  llm: engines,
  config: {
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKey: process.env.ANTHROPIC_API_KEY!,
      baseUrl: "",
    },
    models: new Map(),
    plugins: new Map(),
    paths: { sessiondir: "./sessions" },
  },
  use: [
    myTool,
    myToolProvider,
    myContextProvider,
    (agent) => {
      agent.on("llm:chunk", ({ chunk }) => {
        if (chunk.type === "text-delta") process.stdout.write(chunk.text);
      });
    },
  ],
});
```

### Agent 方法

| 方法 | 说明 |
|------|------|
| `run(input)` | 以用户消息启动 Agent 循环，返回所有消息 |
| `stop()` | 停止运行中的 Agent 循环 |
| `register(item)` | 注册组件（工具、提供者、处理器等） |
| `on(event, listener)` | 订阅生命周期事件 |
| `getMessages()` | 获取会话中的所有消息 |
| `getMessage(id)` | 按 ID 获取特定消息 |
| `getToolList()` | 获取当前所有可用工具 |
| `previewContext()` | 预览将发送给 LLM 的上下文 |
| `setDiscardBefore(id)` | 设置水位线，丢弃指定 ID 之前的消息 |
| `setModel(config)` | 运行时切换到不同的模型 |
| `setModelByPath(path)` | 通过 `provider/model` 路径字符串切换模型 |
| `setAutoApprovedTools(names)` | 设置绕过 HITL 审批的工具 |
| `getConfig()` | 获取当前 Agent 配置 |
| `getContextCount()` | 获取累计 token 使用统计 |

## 内置工具

| 工具 | 说明 | 文档 |
|------|------|------|
| `read` | 读取文件内容或列出目录条目 | [read_CN.md](./document/tools/read_CN.md) |
| `write` | 写入文件（自动创建父目录） | [write_CN.md](./document/tools/write_CN.md) |
| `edit` | 文件内精确字符串替换 | [edit_CN.md](./document/tools/edit_CN.md) |
| `glob` | 按 glob 模式查找文件 | [glob_CN.md](./document/tools/glob_CN.md) |
| `grep` | 使用正则表达式搜索文件内容 | [grep_CN.md](./document/tools/grep_CN.md) |
| `bash` | 执行 bash 命令，支持超时和工作目录 | [bash_CN.md](./document/tools/bash_CN.md) |
| `todo` | 创建、更新、删除待办事项 | [todo_CN.md](./document/tools/todo_CN.md) |
| `subagent` | 基于文件的子 Agent 管理，提供 `run_subagent` 工具 | [subagent_CN.md](./document/tools/subagent_CN.md) |
| `agent-context` | 自动加载 Agent 框架配置文件到上下文 | [agent-context_CN.md](./document/tools/agent-context_CN.md) |
| `mcp` | MCP 客户端，支持 stdio / SSE / Streamable HTTP | [mcp_CN.md](./document/tools/mcp_CN.md) |
| `skill` | 从 `SKILL.md` 清单加载技能指令 | [skill_CN.md](./document/tools/skill_CN.md) |

## CLI

交互式 REPL，支持模型切换、会话管理、HITL 开关等。

```bash
npm run chat
```

→ [CLI 文档](./document/cli/repl_CN.md)

## LLM 引擎

通过 `LLMEngineManager` 管理多个 LLM 引擎：

```typescript
import { LLMEngineManager } from "@piaoxianguo/miniagent";
import { AnthropicEngine } from "@piaoxianguo/miniagent/engine/anthropic";
import { OpenAIEngine } from "@piaoxianguo/miniagent/engine/openai";
import { OpenAICompatibleEngine } from "@piaoxianguo/miniagent/engine/openai-compatible";
import { GLMEngine } from "@piaoxianguo/miniagent/engine/glm";
import { GLMCodePlanEngine } from "@piaoxianguo/miniagent/engine/glm-codeplan";

const engines = new LLMEngineManager();
engines.register("anthropic", AnthropicEngine);
engines.register("openai", OpenAIEngine);
engines.register("openai-compatible", OpenAICompatibleEngine);
engines.register("glm", GLMEngine);
engines.register("glm-codeplan", GLMCodePlanEngine);
```

引擎按 `ModelConfig` 进行 LRU 缓存。实现 `LLMEngine` 接口即可创建自定义引擎。

### ModelConfig

```typescript
interface ModelConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  thinking?: boolean;
  maxTokens?: number;
  contextSize?: number;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
}
```

## 技术栈

- **运行时**：Node.js
- **语言**：TypeScript（strict、ESM、`verbatimModuleSyntax`）
- **Schema**：Zod（beta，兼容 v3 API）
- **测试**：Vitest
- **Lint**：ESLint（typescript-eslint）
- **SDK**：`@anthropic-ai/sdk`、`openai`、`@modelcontextprotocol/sdk`
- **工具**：`eventemitter3`、`lru-cache`、`zod-to-json-schema`

## License

MIT

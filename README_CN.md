# MiniAgent

精简的 TypeScript Agent 框架。默认简单，需要时强大。

[English](./README.md)

## 快速开始

```bash
npm install @piaoxianguo/miniagent
```

```typescript
import { MiniAgent, LLMEngineManager, MessageType } from "@piaoxianguo/miniagent";
import { AnthropicEngine } from "@piaoxianguo/miniagent/engine/anthropic";
import { z } from "zod";

// 1. 配置 LLM 引擎
const engines = new LLMEngineManager();
engines.register("anthropic", AnthropicEngine);

// 2. 创建 Agent
const agent = new MiniAgent(engines, {
  model: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY!,
    baseUrl: "",
  },
  models: new Map(),
  plugins: new Map(),
  paths: { sessiondir: "./sessions" },
});

// 3. 打印流式输出
agent.on("llm:chunk", ({ chunk }) => {
  if (chunk.type === "text-delta") process.stdout.write(chunk.text);
});

// 4. 注册一个工具 —— 就这么简单
agent.register({
  name: "get_weather",
  description: "获取指定城市的天气",
  parameters: z.object({
    city: z.string().describe("城市名称"),
  }),
  execute: async (args) => `${args.city}：晴，25°C`,
});

// 5. 运行
const messages = await agent.run({
  id: crypto.randomUUID(),
  type: MessageType.User,
  content: "北京今天天气怎么样？",
});
```

这是一个完整的、支持流式输出和工具调用的 Agent。没有样板代码，没有配置文件。

## 设计哲学

MiniAgent 基于一个原则：**最小核心，自由组装**。

核心只做一件事 —— Agent 循环（收集上下文 → 调用 LLM → 执行工具 → 循环）。其他一切都是通过同一个 `register()` 方法注册的可插拔组件：

```
                    ┌─────────────────────────────────┐
                    │           MiniAgent              │
                    │                                  │
   register() ───► │  Tool ───────────── execute()    │
                  ◄ │  ContextProvider ── collect()    │
                  ◄ │  ContextProcessor ─ process()    │
                  ◄ │  MessageNotifier ── notify()     │
                  ◄ │  ErrorHandler ───── handle()     │
                  ◄ │  ToolApprover ───── approve()    │
                  ◄ │  ...                             │
                    │                                  │
                    └─────────────────────────────────┘
```

- **Schema 驱动类型** — 所有数据结构用 Zod schema 定义，TypeScript 类型自动推导，运行时验证免费获得。
- **自动检测** — 组件通过 Zod schema 验证识别，而非手动类型标签。注册工具、提供者或处理器，Agent 知道它是什么。
- **插件优于框架** — 没有继承层级，没有抽象基类。只需要满足正确 schema 的普通对象。

## 工具与接口

### Tool

工具是最容易定义的 —— 一个名称、一个描述、一个 Zod 参数 schema 和一个 `execute` 函数：

```typescript
const myTool: Tool = {
  name: "read_file",
  description: "读取文件内容",
  parameters: z.object({
    path: z.string().describe("文件绝对路径"),
  }),
  execute: async (args) => {
    return fs.readFile(args.path, "utf-8");
  },
};

agent.register(myTool);
```

### ToolProvider

当你需要动态提供多个工具（例如连接 MCP 服务器）时，实现 `ToolProvider`：

```typescript
const provider: ToolProvider = {
  async getTools(): Promise<Tool[]> {
    // 动态发现并返回工具
    return [tool1, tool2, tool3];
  },
};

agent.register(provider);
```

### LLMRequire

某些组件需要访问 LLM（例如压缩旧消息的上下文压缩器）。实现 `LLMRequire`，Agent 会在注册时注入 `LLMRequest`：

```typescript
const compressor = {
  priority: -1000,
  private llm: null,

  async setLLMRequest(llm: LLMRequest) {
    this.llm = llm;
  },

  async collect() {
    // 使用 this.llm 摘要旧消息...
    return [summaryMessage];
  },
};
```

### ContextProvider

在每个 turn 中注入额外的上下文消息。按 `priority` 排序：

```typescript
const provider = {
  priority: 0,
  async collect() {
    return [
      { id: crypto.randomUUID(), type: MessageType.System, content: "你是一个有用的助手。" },
    ];
  },
};
```

### ContextProcessor

在发送给 LLM 之前转换消息列表。返回 `Action` 对象来删除、替换或注入消息：

```typescript
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

### 其他接口

| 接口 | 用途 |
|------|------|
| `MessageNotifier` | 每当新消息创建时被调用 |
| `ErrorHandler` | 处理 Agent 循环内的错误（重试、降级等） |
| `ToolApprover` | 工具执行前的人工审批 |
| `AfterTurnProcessor` | 每次 Agent 运行完成后执行逻辑 |
| `ConfigNotifier` | 模型配置变更时收到通知 |
| `PersistRequire` | 接收 `Store` 实例用于持久化 |
| `TurnContextConsumer` | 接收每个 turn 的完整上下文 |
| `TurnContextAppender` | 在其他上下文提供者之前注入消息 |

## LLMRequest 和 LLMEngine

MiniAgent 将 LLM 交互分为两层：

- **`LLMRequest`** — Agent 调用的接口：`streamInvoke(messages, modelConfig, tools) → LLMStreamHandle`。这是契约。
- **`LLMEngine`** — 引擎实现的接口：`streamGenerate(messages, tools) → LLMStreamHandle`。`ModelConfig` 在构造时绑定。
- **`LLMEngineManager`** — 默认的 `LLMRequest` 实现。管理引擎构造函数，按 `ModelConfig` 创建引擎，并通过 LRU 淘汰策略缓存。

```
  MiniAgent ──调用──► LLMRequest (接口)
                            │
                   LLMEngineManager (默认实现)
                            │
                     ┌──────┴──────┐
                  LLMEngine     LLMEngine
                  (Anthropic)   (OpenAI)  ...
```

### 内置引擎

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

实现 `LLMEngine` 接口即可添加自定义引擎：

```typescript
interface LLMEngine {
  streamGenerate(messages: Message[], tools: Tool[]): LLMStreamHandle<LLMResponse>;
}
```

## 蓝图与快速组装

在实际应用中，你不想手动注册每个组件。MiniAgent 提供了一套 **蓝图（Blueprint）** 系统用于声明式 Agent 组装。

### 蓝图

蓝图是对 Agent 所需组件的声明式描述：

```typescript
interface AgentBlueprint {
  uses: string[];  // 组件 ID 列表
}
```

### 注册表与组装器

注册组件工厂，然后从蓝图组装 Agent：

```typescript
import { AgentAssembler, AgentBlueprintRegistry } from "@piaoxianguo/miniagent";

// 注册工厂
const registry = new AgentBlueprintRegistry();
registry.register("tool.read", () => readTool);
registry.register("tool.write", () => writeTool);
registry.register("plugin.mcp", () => new McpPlugin());
registry.register("plugin.skill", () => new SkillPlugin());

// 组装
const assembler = new AgentAssembler(registry);
const agent = await assembler.assemble({
  llm: engines,
  config: agentConfig,
  blueprint: { uses: ["tool.read", "tool.write", "plugin.mcp", "plugin.skill"] },
  capabilities: { tool: { deny: ["bash"] } },  // 可选：控制可见性
});
```

### 能力系统

蓝图配合能力系统控制工具、插件和子 Agent 的可见性：

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

### 工厂函数

更简单的场景下，使用 `createMiniAgent` 的 `use` 数组 —— 一个包含工具、提供者、模块或设置函数的平铺列表：

```typescript
import { createMiniAgent } from "@piaoxianguo/miniagent";

const agent = createMiniAgent({
  llm: engines,
  config: agentConfig,
  use: [
    readTool,
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
| `subagent` | 委托任务给文件定义的子 Agent | [subagent_CN.md](./document/tools/subagent_CN.md) |
| `agent-context` | 自动加载 Agent 框架配置文件到上下文 | [agent-context_CN.md](./document/tools/agent-context_CN.md) |
| `mcp` | MCP 客户端，支持 stdio / SSE / Streamable HTTP | [mcp_CN.md](./document/tools/mcp_CN.md) |
| `skill` | 从 `SKILL.md` 清单加载技能指令 | [skill_CN.md](./document/tools/skill_CN.md) |

## 内置 CLI

MiniAgent 内置了一个基于 Ink（React for CLI）的交互式 REPL：

```bash
npm run chat
```

首次运行会生成 `.cliagent/config.json` 模板。配置模型后再次运行：

```json
{
  "models": [
    {
      "name": "claude",
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "apiKey": "sk-ant-..."
    }
  ],
  "defaultModel": "claude",
  "systemPrompt": "你是一个有用的助手。"
}
```

### CLI 命令

| 命令 | 说明 |
|------|------|
| `/models` | 列出已配置的模型 |
| `/model <provider/model>` | 切换当前模型 |
| `/tools` | 列出已注册的工具 |
| `/history [page]` | 查看对话历史 |
| `/context` | 预览发送给 LLM 的上下文 |
| `/compress` | 触发上下文压缩 |
| `/session` | 列出所有会话 |
| `/session new` | 创建新会话 |
| `/session switch <id>` | 切换到指定会话 |
| `/session delete <id>` | 删除指定会话 |
| `/session rename <id> <name>` | 重命名会话 |
| `/hitl [on\|off]` | 开关人工审批 |
| `/clear` | 清空当前对话 |
| `/system <text>` | 更新系统提示词 |
| `/quit` | 退出 |

→ [完整 CLI 文档](./document/cli/repl_CN.md)

## 事件

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

## Agent API

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

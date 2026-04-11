# MiniAgent

精简的 TypeScript Agent 框架。默认简单，需要时强大。

[English](./README.md)

## 特性

- **精简核心** — 单一 `MiniAgent` 类，统一的 `register()` API 注册所有组件
- **可扩展 LLM 引擎** — 内置 Anthropic / OpenAI / OpenAI 兼容协议 / GLM / GLM-CodePlan，可自定义
- **流式响应** — 原生 streaming，支持 text-delta、reasoning-delta、tool-call-arguments-delta 三种块类型
- **工具系统** — 使用 Zod schema 定义参数，自动工具调用循环
- **上下文管理** — `ContextProvider` / `ContextProcessor` / `TurnContextAware` 灵活控制上下文窗口
- **上下文压缩** — 内置 `ContextCompressor`，消息数超过阈值时自动摘要压缩历史
- **消息持久化** — 基于 JSONL 的消息存储，支持水位线丢弃
- **工具审批（HITL）** — Human-in-the-Loop 机制：批准、拒绝或自动批准工具调用
- **事件系统** — 基于 `EventEmitter` 的完整生命周期事件（run、turn、llm、tool、message）
- **MCP 插件** — 内置 Model Context Protocol 客户端，支持 stdio / SSE / Streamable HTTP 传输
- **Skill 插件** — 从可配置目录中的 `SKILL.md` 清单加载技能指令
- **内置工具** — 文件操作（read、write、edit）、搜索（glob、grep）、bash 执行、todo 管理、子 Agent 生成
- **会话管理** — 创建、切换、重命名、删除会话，每个会话独立持久化
- **配置系统** — 分层配置，包含文件加载器、聚合器、解析器和运行时服务
- **CLI** — 交互式 REPL，支持模型切换、会话管理、HITL 开关、上下文预览等

## 安装

```bash
npm install @piaoxianguo/miniagent
```

## 快速开始

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

`createMiniAgent` 提供了一种简洁的方式，可以在一次调用中创建包含所有组件的 Agent：

```typescript
import { createMiniAgent, LLMEngineManager, MessageType } from "@piaoxianguo/miniagent";
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
    myTool,                       // Tool
    myToolProvider,                // ToolProvider
    myContextProvider,             // ContextProvider
    (agent) => {                   // 安装器函数
      agent.on("llm:chunk", ({ chunk }) => {
        if (chunk.type === "text-delta") process.stdout.write(chunk.text);
      });
    },
  ],
});
```

### 使用 CLI

```bash
npm run chat
```

首次运行会生成 `.cliagent/config.json` 模板。配置你的模型：

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
  "systemPrompt": "You are a helpful assistant."
}
```

## 核心概念

### MiniAgent

框架核心类。通过统一的 `register()` 方法注册工具、提供者、处理器等组件：

```typescript
const agent = new MiniAgent(llmRequest, config);

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

Agent 通过 Zod schema 验证自动检测组件类型——无需手动指定注册的是什么。

#### Agent 方法

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

### LLM 引擎

通过 `LLMEngineManager` 管理多个 LLM 引擎，按 `ModelConfig` 中的 `provider` 字段分发：

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

引擎按 `ModelConfig` 进行 LRU 缓存。实现 `LLMEngine` 接口即可创建自定义引擎：

```typescript
interface LLMEngine {
  streamGenerate(messages: Message[], tools: Tool[]): LLMStreamHandle<LLMResponse>;
}
```

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

### 工具

工具使用 Zod schema 进行参数验证：

```typescript
import { z } from "zod";

const tool = {
  name: "search",
  description: "搜索网页",
  parameters: z.object({
    query: z.string().describe("搜索关键词"),
    limit: z.number().optional().describe("最大结果数"),
  }),
  execute: async (args) => {
    return `${args.query} 的搜索结果`;
  },
};
agent.register(tool);
```

`ToolProvider` 支持每个 turn 动态注册工具：

```typescript
const provider = {
  async getTools() {
    return [tool1, tool2];
  },
};
agent.register(provider);
```

### 内置工具

框架附带开箱即用的工具：

| 工具 | 说明 |
|------|------|
| `readTool` | 读取文件内容或列出目录条目 |
| `writeTool` | 写入文件（自动创建父目录） |
| `editTool` | 文件内精确字符串替换 |
| `globTool` | 按 glob 模式查找文件（`**/*.ts` 等） |
| `grepTool` | 使用正则表达式搜索文件内容 |
| `bashTool` | 执行 bash 命令，支持超时和工作目录 |
| `TodoManager` | 创建、更新、删除待办事项；将 todo 列表注入上下文 |
| `SubAgentProvider` | 生成子 Agent 处理委托任务 |

### 上下文系统

#### ContextProvider

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

#### ContextProcessor

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

#### TurnContextAware 与 TurnContextAppend

- `TurnContextAware` — 在每次 LLM 调用前接收当前 turn 编号和完整上下文
- `TurnContextAppend` — 在每次上下文构建开始时追加额外消息

### 上下文压缩

`ContextCompressor` 在对话超过阈值时自动摘要压缩旧消息：

```typescript
import { ContextCompressor } from "@piaoxianguo/miniagent";

const compressor = new ContextCompressor(engines, modelConfig, {
  maxMessages: 50,
  keepRecent: 10,
});
agent.register(compressor);

// 手动调用或在每次 run 后调用：
compressor.updateMessages(messages);
await compressor.maybeCompress();
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
    if (answer === "always") return "approve_all"; // 之后自动批准
    return answer ? "approve" : "deny";
  },
};
agent.register(approver);

// 对安全工具绕过 HITL：
agent.setAutoApprovedTools(["read", "glob", "grep"]);
```

审批决策：`"approve"` | `"deny"` | `"approve_all"`

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

### MCP 插件

`McpPlugin` 连接 MCP 服务器并将其工具暴露给 Agent：

```typescript
import { McpPlugin } from "@piaoxianguo/miniagent/tool/mcp";

const mcp = new McpPlugin();
agent.register(mcp);
```

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

| 传输方式 | 配置字段 | 说明 |
|-----------|--------|------|
| `stdio` | `command`、`args?`、`env?` | 启动子进程 |
| `sse` | `url` | HTTP SSE 连接（旧版） |
| `streamable-http` | `url` | Streamable HTTP（推荐） |

MCP 工具以 `mcp__{serverName}__{toolName}` 格式注册，避免命名冲突。`McpPlugin` 同时实现 `ToolProvider` 和 `ConfigNotifier`——每个 turn 动态重建工具列表，连接失败的服务器会被静默跳过。

### Skill 插件

`SkillPlugin` 扫描目录中的 `SKILL.md` 清单文件，将其作为上下文和 `load_skill` 工具暴露：

```typescript
import { SkillPlugin } from "@piaoxianguo/miniagent/tool/skill";

const skill = new SkillPlugin();
agent.register(skill);
```

在 `plugins.skill` 中配置：

```json
{
  "plugins": {
    "skill": {
      "directories": ["./skills/", "~/.cliagent/skills/"]
    }
  }
}
```

每个技能目录应包含带 frontmatter 的 `SKILL.md`：

```markdown
---
id: my-skill
name: 我的技能
description: 用于 X 的自定义技能
---

技能指令内容...
```

### 会话管理

`SessionManager` 处理多会话持久化：

```typescript
import { SessionManager } from "@piaoxianguo/miniagent";

const sessions = new SessionManager("./data");
await sessions.load();

const session = await sessions.create("my-session");
sessions.setActive(session.id);

// 列表、切换、重命名、删除：
const list = sessions.list();
sessions.setActive("other-id");
await sessions.renameSession("id", "new-name");
await sessions.delete("id");
```

### Agent 模块

`defineAgentModule` 创建可注册到 Agent 的类型化、可组合模块对象：

```typescript
import { defineAgentModule } from "@piaoxianguo/miniagent";

const module = defineAgentModule({
  priority: 0,
  async collect() {
    return [{ id: "ctx", type: MessageType.System, content: "额外上下文" }];
  },
});
agent.register(module);
```

### 配置系统

框架提供分层配置工具：

| 组件 | 说明 |
|------|------|
| `PersistentConfigFileLoader` | 从 JSON 文件加载配置 |
| `PersistentConfigAggregator` | 合并多个配置来源 |
| `AgentConfigResolver` | 带运行时覆盖的配置解析 |
| `AgentConfigService` | 高级配置管理服务 |

```typescript
import {
  PersistentConfigFileLoader,
  PersistentConfigAggregator,
  AgentConfigResolver,
  AgentConfigService,
} from "@piaoxianguo/miniagent";
```

### 消息类型

| 类型 | 说明 |
|------|------|
| `SystemMessage` | 系统指令 |
| `UserMessage` | 用户输入 |
| `AssistMessage` | LLM 文本响应（包含可选的 `reasoningContent`） |
| `ToolCallMessage` | LLM 请求工具执行 |
| `ToolResultMessage` | 工具执行结果 |

### 流式块类型

| 类型 | 说明 |
|------|------|
| `TextDeltaChunk` | 增量文本内容 |
| `ReasoningDeltaChunk` | 增量推理/思考内容 |
| `ToolCallArgumentsDeltaChunk` | 增量工具调用参数 |

## CLI

内置 CLI 提供功能丰富的交互式 REPL：

```bash
npm run chat
```

### CLI 命令

| 命令 | 说明 |
|------|------|
| `/models` | 列出已配置的模型 |
| `/model <provider/model>` | 切换活动模型 |
| `/tools` | 列出已注册的工具 |
| `/history [page]` | 查看对话历史 |
| `/context` | 预览发送给 LLM 的上下文 |
| `/compress` | 手动触发上下文压缩 |
| `/session` | 列出所有会话 |
| `/session new` | 创建新会话 |
| `/session switch <id>` | 切换到指定会话 |
| `/session delete <id>` | 删除指定会话 |
| `/session rename <id> <name>` | 重命名会话 |
| `/hitl [on\|off]` | 开关 Human-in-the-Loop |
| `/clear` | 清空当前对话 |
| `/system <text>` | 更新系统提示词 |
| `/help` | 显示帮助 |
| `/quit` | 退出 |

## 项目结构

```
src/
  index.ts                    # 公共 API 导出
  core/
    agent.ts                  # MiniAgent 类 — 主循环
    create-agent.ts           # createMiniAgent 工厂函数
    module.ts                 # defineAgentModule 辅助函数
    types.ts                  # Zod schema 和类型定义
    llm.ts                    # LLMEngineManager，引擎抽象层
    config.ts                 # 配置 schema
    events.ts                 # 事件类型定义
    errors.ts                 # StopException
    message-source.ts         # 消息序列管理
    file-store.ts             # 文件存储工具
    session.ts                # SessionManager
  context/
    compressor.ts             # ContextCompressor
  tool/
    types.ts                  # Tool 和 ToolProvider schema
    approver.ts               # ToolApprover（HITL）
    read.ts / write.ts / edit.ts  # 文件操作工具
    glob.ts / grep.ts         # 搜索工具
    bash.ts                   # Shell 执行工具
    todo.ts                   # TodoManager 工具 + 上下文处理器
    subagent.ts               # SubAgentProvider
    mcp/                      # MCP 插件
    skill/                    # Skill 插件
  engine/
    anthropic/                # Anthropic Claude 引擎
    openai/                   # OpenAI 引擎
    openai-compatible/        # OpenAI 兼容协议引擎
    glm/                      # 智谱 GLM 引擎
    glm-codeplan/             # 智谱 GLM CodePlan 引擎
  cli/                        # 交互式 CLI
  utils/config/               # 配置工具
```

## 技术栈

- **运行时**：Node.js
- **语言**：TypeScript（strict、ESM、`verbatimModuleSyntax`）
- **Schema**：Zod（beta，兼容 v3 API）
- **测试**：Vitest
- **Lint**：ESLint（typescript-eslint）
- **SDK**：`@anthropic-ai/sdk`、`openai`、`@modelcontextprotocol/sdk`
- **工具**：`eventemitter3`、`lru-cache`、`zod-to-json-schema`

## 导出

```typescript
// 核心
import { MiniAgent, createMiniAgent, defineAgentModule } from "@piaoxianguo/miniagent";
import { LLMEngineManager } from "@piaoxianguo/miniagent";
import { MessageSource, FileStore, SessionManager } from "@piaoxianguo/miniagent";
import { ContextCompressor } from "@piaoxianguo/miniagent";
import { StopException } from "@piaoxianguo/miniagent";

// 类型与枚举
import { MessageType, ActionType, LLMStreamChunkType } from "@piaoxianguo/miniagent";

// 引擎
import { AnthropicEngine } from "@piaoxianguo/miniagent/engine/anthropic";
import { OpenAIEngine } from "@piaoxianguo/miniagent/engine/openai";
import { OpenAICompatibleEngine } from "@piaoxianguo/miniagent/engine/openai-compatible";
import { GLMEngine } from "@piaoxianguo/miniagent/engine/glm";
import { GLMCodePlanEngine } from "@piaoxianguo/miniagent/engine/glm-codeplan";

// 插件
import { McpPlugin } from "@piaoxianguo/miniagent/tool/mcp";
import { SkillPlugin } from "@piaoxianguo/miniagent/tool/skill";

// 配置工具
import {
  PersistentConfigFileLoader,
  PersistentConfigAggregator,
  AgentConfigResolver,
  AgentConfigService,
} from "@piaoxianguo/miniagent";
```

## License

MIT

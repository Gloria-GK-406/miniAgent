# MiniAgent

精简的 TypeScript Agent 框架。默认简单，需要时强大。

[English](./README.md)

## 快速开始

```bash
npm install @piaoxianguo/miniagent
```

```typescript
import {
  MiniAgent,
  LLMEngineManager,
  MessageType,
} from "@piaoxianguo/miniagent";
import { OpenAIEngine } from "@piaoxianguo/miniagent/engine/openai";
import { z } from "zod";

// 1. 配置 LLM 引擎
const llm = new LLMEngineManager();
llm.register(new OpenAIEngine());

// 2. 创建 Agent
const agent = new MiniAgent({
  llm,
  config: {
    providers: [
      {
        provider: "openai",
        key: process.env.OPENAI_API_KEY!,
        models: [{ id: "fast", name: "gpt-4o-mini" }],
      },
    ],
    defaultModel: { id: "fast", provider: "openai" },
    generation: {
      temperature: 0.7,
      thinking: "medium",
    },
    paths: { sessiondir: "./sessions" },
  },
});

console.log(agent.getModels().map((model) => model.id));
agent.setGenerationConfig({ temperature: 0.2, thinking: "none" });

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
| `PersistRequire` | 接收 `Store` 实例用于持久化 |
| `TurnContextConsumer` | 接收每个 turn 的完整上下文 |
| `TurnContextAppender` | 在其他上下文提供者之前注入消息 |
| `Destroyable` | 调用 `MiniAgent.destroy()` 时清理资源 |

## LLMRequest 和 LLMEngine

MiniAgent 将 LLM 交互分为两层：

- **`LLMRequest`** — Agent 调用的接口：`streamInvoke(request)`。
- **`LLMEngine`** — 引擎实现的接口，暴露 `name`、`getModels()` 和 `streamGenerate(request)`。
- **`LLMEngineManager`** — 默认的 `LLMRequest` 实现。注册引擎实例，并按已解析的模型请求路由。

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
engines.register(new AnthropicEngine());
engines.register(new OpenAIEngine());
engines.register(new OpenAICompatibleEngine());
engines.register(new GLMEngine());
engines.register(new GLMCodePlanEngine());
```

Provider-mode 引擎暴露模型目录，并接收包含 provider、model 和 generation 的请求对象：

```typescript
interface LLMEngine {
  readonly name: string;
  getModels(): ModelPreset[];
  streamGenerate(request: LLMGenerateRequest): AsyncGenerator<MessageChunk>;
}
```

## 蓝图与快速组装

在实际应用中，你不想手动注册每个组件。MiniAgent 提供了一套 **蓝图（Blueprint）** 系统用于声明式 Agent 组装。

### 蓝图

蓝图是对 Agent 级组件的声明式描述。每个槽位都使用统一的 `{ use, config }` 形状，但槽位本身赋予组件语义：

```typescript
const blueprint = {
  engines: [{ use: "openai" }],
  persistence: {
    use: "file",
    config: { rootDir: ".miniagent/session/default", fileName: "messages.jsonl" },
  },
  compression: {
    use: "summary",
    config: { maxMessages: 60, keepRecent: 15 },
  },
  tools: [{ use: "read" }, { use: "grep" }, { use: "bash" }],
  mcp: { use: "config", config: { servers: {} } },
};
```

### 蓝图管理器

注册语义组件槽位的实现，然后从蓝图组装 Agent：

```typescript
import {
  BlueprintManager,
  registerBuiltinBlueprintImpls,
} from "@piaoxianguo/miniagent";

const manager = new BlueprintManager();
registerBuiltinBlueprintImpls(manager, {
  subagentFactory,
  getAgentConfig: () => agentConfig,
});

const agent = await manager.assemble({
  config: agentConfig,
  blueprint,
});
```

### 能力系统

部分蓝图实现会在自己的 `config` 中接收能力规则，用来控制 MCP 服务/工具、skill 或子 Agent 的可见性：

```typescript
const blueprint = {
  mcp: {
    use: "config",
    config: {
      servers,
      capabilities: {
        server: { allow: ["filesystem"] },
        tool: { deny: ["mcp__filesystem__write_file"] },
      },
    },
  },
  skill: {
    use: "local-directory",
    config: { directories: ["skill/"], capabilities: { allow: ["*"] } },
  },
  subagent: {
    use: "local-directory-sync",
    config: { path: "subagent/", capabilities: { deny: ["dangerous-agent"] } },
  },
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
  "providers": [
    {
      "engine": "anthropic",
      "key": "sk-ant-...",
      "models": [{ "id": "sonnet", "name": "claude-sonnet-4-5" }]
    },
    {
      "engine": "openai-compatible",
      "key": "local",
      "baseURL": "http://localhost:11434/v1",
      "models": [{ "id": "local", "name": "qwen2.5-coder" }]
    }
  ],
  "defaultModel": "sonnet",
  "defaultAgent": "build",
  "permission": {
    "*": "ask",
    "read": "allow",
    "glob": "allow",
    "grep": "allow",
    "shell": {
      "*": "ask",
      "rm -rf *": "deny",
      "rm -fr *": "deny",
      "rm -r *": "deny",
      "Remove-Item -Recurse *": "deny",
      "Remove-Item -r *": "deny",
      "rmdir /s *": "deny",
      "del /s *": "deny"
    }
  },
  "shell": {
    "windows": "powershell",
    "timeoutMs": 120000
  },
  "tui": {
    "showReasoning": false,
    "showToolDetails": false
  },
  "generation": {
    "temperature": 0.7,
    "thinking": "medium"
  }
}
```

### CLI 命令

| 命令 | 说明 |
|------|------|
| `/about` | 显示 CLI 版本和运行环境信息 |
| `/agent [build\|plan]` | 查看或切换主 Agent 模式 |
| `/auto` | 切换自动批准未被拒绝的请求 |
| `/details` | 切换工具详情显示 |
| `/thinking` | 切换推理内容显示 |
| `/models` | 打开模型选择器 |
| `/model <id\|provider/id>` | 按解析后的模型 ID 切换活动模型 |
| `/new [name]` | 创建并切换到新会话 |
| `/tools` | 列出已注册的工具 |
| `/history` | 查看对话历史 |
| `/context` | 预览发送给 LLM 的上下文 |
| `/references` | 列出可用于 `@file` 引用的文件 |
| `/compact` | 运行上下文压缩 |
| `/sessions [new\|switch\|fork\|rename\|delete]` | 显示或管理会话 |
| `/export [json\|markdown] [path]` | 导出当前会话 |
| `/import <path> [name]` | 导入 JSON 会话导出 |
| `/undo` | 撤销最后一个用户 turn 并恢复文件快照 |
| `/redo` | 在可行时重新应用上一次撤销的 turn |
| `/help` | 显示帮助 |
| `/commands [query]` | 显示可搜索的 slash command 帮助 |
| `/keybindings` | 显示键盘快捷键 |
| `/quit` | 退出 |

快捷键：`Tab` 会完成当前建议；没有建议时在 build/plan 之间切换。
`Ctrl+C` 会停止运行中的 Agent，空闲时按两次退出；`PgUp`/`PgDn`
滚动对话，`Esc` 关闭面板或拒绝审批。审批提示还支持用 `a`/`d`
在当前会话中允许或拒绝同一个请求，不会写入项目权限配置。

CLI 使用产品级权限策略：读/搜索工具默认允许，写入、编辑和 Shell
命令默认询问，显式拒绝规则始终生效。会话级审批决策会匹配精确的工具参数，
因此批准一个 Shell 命令不会放开整个 Shell 工具。以 `!` 开头的消息会通过配置的
CLI shell service 执行。Agent 还会获得 git 只读工具、受保护的 `git_commit`
和经权限控制的 `diagnostics` 工具。项目自定义命令可以放在
`.cliagent/commands/*.md`；导出、导入、撤销和重做都使用项目本地的
`.cliagent/` 数据。会话导出会包含模型、Agent 模式和 token 用量等元数据。

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
| `destroy()` | 停止 Agent 并清理已注册的可销毁资源 |
| `register(item)` | 注册组件（工具、提供者、处理器等） |
| `on(event, listener)` | 订阅生命周期事件 |
| `getMessages()` | 获取会话中的所有消息 |
| `getMessage(id)` | 按 ID 获取特定消息 |
| `getToolList()` | 获取当前所有可用工具 |
| `previewContext()` | 预览将发送给 LLM 的上下文 |
| `setDiscardBefore(id)` | 设置水位线，丢弃指定 ID 之前的消息 |
| `getModels()` / `getResolvedModels()` | 获取已解析的 provider 限定模型列表 |
| `getCurrentResolvedModel()` | 获取当前活动模型 |
| `setResolvedModel(selector)` | 通过 `{ id }` 或 `{ provider, model }` 切换活动模型 |
| `getGenerationConfig()` | 获取 temperature、thinking 等生成配置 |
| `setGenerationConfig(update)` | 更新生成配置，不切换活动模型 |
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

## CLI Phase 3 补充

- 项目配置位于 `.cliagent/config.json`；全局默认配置可放在 `%APPDATA%/miniagent/config.json`、`$XDG_CONFIG_HOME/miniagent/config.json` 或 `~/.config/miniagent/config.json`。项目配置覆盖全局配置，数组整体替换，对象浅合并。
- 新增命令：`/git [status|log]`、`/diff [--staged] [path]`、`/editor [initial text]`、`/diagnostics`、`/activity`、`/permissions`、`/system`、`/references`、`/init [--force]`；headless 支持 `--list-references [--json]`、`--show-permissions [--json]` 和 `--show-system-prompt [--json]`。
- CLI Agent 现在包含 git-aware 只读工具和受权限保护的 `git_commit`，并提供 diff、诊断、外部编辑器和活动面板。

## License

MIT

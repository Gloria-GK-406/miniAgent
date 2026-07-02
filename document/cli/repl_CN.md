# CLI

内置 CLI 提供功能丰富的交互式 REPL。

## 快速开始

```bash
npm run chat
```

首次运行会生成 `.cliagent/config.json` 模板。配置你的模型：

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
    "grep": "allow"
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

CLI provider 配置使用 `providers[].engine` 指定内置引擎适配器，`providers[].key`
填写 API 密钥，`providers[].baseURL` 可选，`providers[].models` 必须是
`{ id, name }` 形状的模型预设数组。`defaultModel` 可填写 `sonnet` 这样的模型
ID；当 ID 有歧义时使用 `provider/id`。`generation.thinking` 接受 `none`、`low`、
`medium`、`high` 或 `max`；不支持的级别会在引擎内降级。
`defaultAgent` 控制默认 Agent 模式，`permission` 控制产品级权限策略，`shell`
控制跨平台 Shell 执行方式，`tui` 控制界面展示偏好。

## 命令

| 命令 | 说明 |
|------|------|
| `/agent [build\|plan]` | 查看或切换主 Agent 模式 |
| `/auto` | 切换自动批准未被拒绝的请求 |
| `/details` | 切换工具详情显示 |
| `/thinking` | 切换推理内容显示 |
| `/models` | 打开模型选择器 |
| `/model <id\|provider/id>` | 按解析后的模型 ID 切换活动模型 |
| `/tools` | 列出已注册的工具 |
| `/history` | 查看对话历史 |
| `/context` | 预览发送给 LLM 的上下文 |
| `/sessions` | 显示当前会话信息 |
| `/help` | 显示帮助 |
| `/quit` | 退出 |

## 内置工具

CLI Agent 通过语义蓝图组装。默认蓝图始终包含：

- **read** — 读取文件和目录
- **write** — 写入文件
- **edit** — 精确字符串替换编辑文件
- **glob** — 按模式查找文件
- **grep** — 搜索文件内容
- **shell** — 通过 CLI shell service 执行 Shell 命令
- **todo** — 任务管理（todo_create、todo_update、todo_delete）

当 `.cliagent/config.json` 包含 `mcp`、`skill` 或 `subagent` 字段时，这些
CLI 便捷字段会在组装时复制到蓝图组件配置中：

- **mcp** — 连接 MCP 服务器并暴露带前缀的 MCP 工具
- **skill** — 通过 `load_skill` 加载本地技能指令
- **subagent** — 将任务委托给基于文件配置的子 Agent

## 权限

CLI 使用产品级权限策略。读/搜索工具默认允许，写入、编辑和 Shell 命令默认询问，
显式拒绝规则始终生效。`/auto` 只会允许原本需要询问的请求，不会覆盖拒绝规则。

## Shell

以 `!` 开头的消息会通过 CLI shell service 在本地执行，并把输出记录到对话中。
Windows 默认使用 PowerShell；配置可以切换到 Git Bash、WSL、cmd 或显式可执行文件。

## 上下文压缩

CLI 使用 `ContextCompressor`，默认配置：

- `maxMessages`：60
- `keepRecent`：15

压缩会作为已组装 Agent runtime 的一部分运行。

## 模型配置

模型在 `.cliagent/config.json` 中通过 provider 条目配置：

| 字段 | 必填 | 说明 |
|------|------|------|
| `providers[].engine` | 是 | 引擎适配器（`anthropic`、`openai`、`openai-compatible`、`glm`、`glm-codeplan`、`nvidia`） |
| `providers[].key` | 是 | API 密钥 |
| `providers[].baseURL` | 否 | 自定义基础 URL，通常用于 `openai-compatible` |
| `providers[].models` | 是 | 模型预设数组 |
| `providers[].models[].id` | 是 | `/model` 和 `defaultModel` 使用的选择器 ID |
| `providers[].models[].name` | 是 | 发送给引擎的真实模型名 |
| `defaultModel` | 否 | 模型 ID，如 `sonnet`；有歧义时使用 `provider/id` |
| `defaultAgent` | 否 | `build` 或 `plan`，默认 `build` |
| `permission` | 否 | 产品级 allow/ask/deny 权限策略 |
| `shell` | 否 | 跨平台 Shell 设置 |
| `tui` | 否 | TUI 展示偏好 |
| `generation.temperature` | 否 | 默认 `0.7` |
| `generation.thinking` | 否 | `none`、`low`、`medium`、`high` 或 `max` |

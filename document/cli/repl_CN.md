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

## 命令

| 命令 | 说明 |
|------|------|
| `/models` | 列出已配置的模型 |
| `/model <id\|provider/id>` | 切换活动模型 |
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

## 内置工具

CLI Agent 通过语义蓝图预配置了以下工具：

- **read** — 读取文件和目录
- **write** — 写入文件
- **edit** — 精确字符串替换编辑文件
- **glob** — 按模式查找文件
- **grep** — 搜索文件内容
- **bash** — 执行 Shell 命令
- **todo** — 任务管理（todo_create、todo_update、todo_delete）
- **subagent** — 委托任务给子 Agent
- **mcp** — 连接 MCP 服务器
- **skill** — 加载技能指令

## HITL（人工审批）

默认启用 HITL。使用 `/hitl off` 可自动批准所有工具调用。以下工具始终自动批准：

- `read`
- `glob`
- `grep`

## 上下文压缩

CLI 使用 `ContextCompressor`，默认配置：

- `maxMessages`：60
- `keepRecent`：15

使用 `/compress` 手动触发压缩。

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
| `generation.temperature` | 否 | 默认 `0.7` |
| `generation.thinking` | 否 | `none`、`low`、`medium`、`high` 或 `max` |

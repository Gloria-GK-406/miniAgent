# CLI

内置 CLI 提供功能丰富的交互式 REPL。

## 快速开始

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
  "systemPrompt": "You are a helpful assistant.",
  "subagent": {
    "path": "./.cliagent/subagent/"
  }
}
```

## 命令

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

## 内置工具

CLI Agent 通过共享蓝图预配置了以下工具：

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

模型在 `.cliagent/config.json` 中配置。每个模型条目需要：

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 模型的显示名称 |
| `provider` | 是 | 引擎提供者（`anthropic`、`openai`、`openai-compatible`、`glm`、`glm-codeplan`） |
| `model` | 是 | 模型标识符 |
| `apiKey` | 是 | API 密钥 |
| `baseUrl` | 否 | 自定义基础 URL（`openai-compatible` 必填） |

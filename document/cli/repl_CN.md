# CLI

## CLI Phase 3 命令与面板

- `/git [status|log]`：查看 git 状态或近期日志。
- `/diff [--staged] [path]`：打开可滚动的 unified diff 面板。
- `/editor [initial text]`：用外部编辑器撰写下一条提示，非空内容会走正常输入路径提交。
- `/diagnostics`：运行配置的诊断命令，或从 `package.json` 自动发现 `npm run typecheck`、`npm run lint`、`npm test`。
- `/activity`：查看最近工具调用和子 Agent 形态工具调用的活动时间线。
- `/permissions`：查看当前 allow/ask/deny 权限策略。
- `/references`：查看可用于 `@file` 引用补全的文件。
- `--list-references [--json]`：以 headless 方式查看可用于 `@file` 引用补全的文件。
- `--show-permissions [--json]`：以 headless 方式查看当前 allow/ask/deny 权限策略。
- `--show-system-prompt [--json]`：以 headless 方式查看基础和实际生效的系统提示词。
- `/system`：查看基础系统提示词和实际生效的系统提示词。
- `/init [--force]`：根据项目脚本和目录生成 `AGENTS.md` 初稿；默认不覆盖已有文件。

CLI Agent 还会注入 `git_status`、`git_diff`、`git_log` 和受权限保护的
`git_commit` 工具。`editor` 配置可指定 `executable`、`args` 和 `wait`；
`diagnostics` 配置可指定 `commands` 和 `timeoutMs`。

## 全局配置

CLI 会读取项目本地的 `.cliagent/config.json`，也支持全局默认配置：

- Windows：`%APPDATA%/miniagent/config.json`
- macOS/Linux 且设置 XDG：`$XDG_CONFIG_HOME/miniagent/config.json`
- macOS/Linux 默认：`~/.config/miniagent/config.json`

当项目配置和全局配置同时存在时，先加载全局配置，再由项目配置覆盖。`providers`
这类数组字段会整体替换；`permission`、`shell`、`editor`、`diagnostics`
这类对象字段会做浅合并，方便项目只覆盖少量设置。

如果两个位置都没有配置文件，CLI 仍会保持首次运行行为，在项目下生成
`.cliagent/config.json` 模板。

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
| `/search <query>` | 搜索当前会话 transcript |
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

## 快捷键

| 按键 | 动作 |
|------|------|
| `Tab` | 完成当前建议；没有建议时在 build/plan 之间切换 |
| `Enter` | 提交当前提示或确认当前选择 |
| `Ctrl+C` | 运行中停止 Agent；空闲时按两次退出 |
| `PgUp` / `PgDn` | 滚动对话 transcript |
| `Esc` | 关闭当前面板或拒绝审批 |
| `a` / `d` | 在当前会话中允许或拒绝同一个审批请求 |

## 内置工具

CLI Agent 通过语义蓝图组装。默认蓝图始终包含：

- **read** — 读取文件和目录
- **write** — 写入文件
- **edit** — 精确字符串替换编辑文件
- **multi_edit** — 对单个文件原子执行多个精确字符串替换
- **patch** — 应用保守的单文件 unified patch
- **glob** — 按模式查找文件
- **grep** — 搜索文件内容
- **shell** — 通过 CLI shell service 执行 Shell 命令
- **todo** — 任务管理（todo_create、todo_update、todo_delete）
- **diagnostics** — 经权限批准后运行配置或自动发现的项目诊断命令

当 `.cliagent/config.json` 包含 `mcp`、`skill` 或 `subagent` 字段时，这些
CLI 便捷字段会在组装时复制到蓝图组件配置中：

- **mcp** — 连接 MCP 服务器并暴露带前缀的 MCP 工具
- **skill** — 通过 `load_skill` 加载本地技能指令
- **subagent** — 将任务委托给基于文件配置的子 Agent

## 权限

CLI 使用产品级权限策略。读/搜索工具默认允许，写入、编辑和 Shell 命令默认询问，
显式拒绝规则始终生效。`/auto` 只会允许原本需要询问的请求，不会覆盖拒绝规则。

审批提示支持用 `y` 或 `Enter` 单次批准，用 `n` 或 `Esc` 单次拒绝，用 `a`
在当前会话中允许同一个请求，用 `d` 在当前会话中拒绝同一个请求。会话级决策按
工具名和参数精确匹配，不会持久化到 `.cliagent/config.json`。

## Shell

以 `!` 开头的消息会通过 CLI shell service 在本地执行，并把输出记录到对话中。
Windows 默认使用 PowerShell；配置可以切换到 Git Bash、WSL、cmd 或显式可执行文件。

## 会话与自定义命令

会话保存在项目本地的 `.cliagent/sessions` 下。`/new` 创建并切换到新会话；
`/sessions` 打开会话面板，子命令可以创建、切换、fork、重命名或删除会话。最后一个
会话会受到保护，不能删除。

项目自定义命令放在 `.cliagent/commands/*.md`。文件名就是 slash command 名称。
可选 YAML frontmatter 支持 `description`、`agent` 和 `model`；Markdown 正文会通过
正常 runtime 路径提交，其中 `{{args}}` 或 `$ARGUMENTS` 会替换成用户参数。

## 导出、导入、撤销

`/export markdown` 写出可读 transcript，`/export json` 写出经过 schema 校验的会话导出。
两种格式都会包含所选模型、Agent 模式和 token 用量等会话元数据。`/import` 会从 JSON
导出创建新会话并切换过去。

会修改工作区的工具会记录每个 turn 的文件快照。`/undo` 删除最后一个用户 turn，并在
当前文件内容仍匹配记录的修改后内容时恢复文件。`/redo` 会在没有冲突时重新应用被撤销的
消息和文件状态。

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

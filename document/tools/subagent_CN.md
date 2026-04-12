# subagent

基于文件的子 Agent 管理，提供 `run_subagent` 工具，同时提供简单的内联 `SubAgentProvider` 用于生成子 Agent。

## SubAgentProvider（简单模式）

使用自定义系统提示词内联生成子 Agent：

```typescript
import { SubAgentProvider } from "@piaoxianguo/miniagent";

const factory = async (task: string, systemPrompt: string) => {
  // 创建并返回一个 MiniAgent 实例
};

const provider = new SubAgentProvider(factory);
agent.register(provider);
```

注册一个 `subagent` 工具：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task` | `string` | 是 | 要委托给子 Agent 的任务描述 |
| `system_prompt` | `string` | 否 | 子 Agent 的自定义系统提示词 |

## SubagentPlugin（基于文件）

扫描目录中带 frontmatter 的 Markdown 文件来定义子 Agent。每个文件成为一个拥有独立系统提示词、模型和能力规则的子 Agent。

### 设置

```typescript
import { SubagentPlugin } from "@piaoxianguo/miniagent/tool/subagent";

const subagent = new SubagentPlugin(factory);
agent.register(subagent);
```

在 `plugins.subagent` 中配置：

```json
{
  "plugins": {
    "subagent": {
      "path": "./.cliagent/subagent/"
    }
  }
}
```

### 子 Agent 定义文件

子 Agent 目录中的每个 Markdown 文件定义一个子 Agent：

```markdown
---
id: code-reviewer
name: Code Reviewer
description: Reviews code for quality and security issues
model: anthropic/claude-sonnet-4-20250514
capabilities:
  tool:
    allow: ["read", "glob", "grep"]
    deny: ["bash", "write", "edit"]
---

You are a senior code reviewer. Analyze code for:
- Security vulnerabilities
- Performance issues
- Best practice violations
```

Frontmatter 字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一的子 Agent 标识符 |
| `name` | 否 | 显示名称（默认为 `id`） |
| `description` | 否 | 在工具列表中显示的简短描述 |
| `model` | 否 | 使用的模型，`provider/model` 格式 |
| `capabilities` | 否 | 用于过滤可用工具的 `AgentCapabilityRule` |

### run_subagent 工具

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agent` | `string` | 是 | 要调用的子 Agent `id` 或 `name` |
| `task` | `string` | 是 | 要委托的任务描述 |
| `context` | `string` | 否 | 注入到子 Agent 的额外上下文 |

### 能力支持

`SubagentPlugin` 实现了 `AgentCapabilityAware`。控制哪些子 Agent 可见：

```typescript
const capabilities = {
  subagent: { deny: ["dangerous-agent"] }
};
```

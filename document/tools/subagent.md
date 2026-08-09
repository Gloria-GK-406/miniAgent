# subagent

File-based subagent management with `run_subagent` tool, plus a simple inline `SubAgentProvider` for spawning sub-agents.

## SubAgentProvider (Simple)

Spawn sub-agents inline with a custom system prompt:

```typescript
import { SubAgentProvider } from "@piaoxianguo/miniagent";

const factory = async (task: string, systemPrompt: string) => {
  // Create and return a MiniAgent instance
};

const provider = new SubAgentProvider(factory);
agent.register(provider);
```

Registers a `subagent` tool:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | `string` | Yes | The task description to delegate to the sub-agent |
| `system_prompt` | `string` | No | Custom system prompt for the sub-agent |

## SubagentPlugin (File-based)

Scans directories for Markdown files with frontmatter to define subagents. Each file becomes a subagent with its own system prompt, model, and capability rules.

### Setup

```typescript
import { SubagentPlugin } from "@piaoxianguo/miniagent/extensions/subagent";

const subagent = new SubagentPlugin({
  path: "./.cliagent/subagent/",
}, factory);
await subagent.initialize();
agent.register(subagent);
```

Pass the subagent directory to the plugin constructor:

```json
{
  "path": "./.cliagent/subagent/",
  "capabilities": { "deny": ["dangerous-agent"] }
}
```

### Subagent Definition File

Each Markdown file in the subagent directory defines one subagent:

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

Frontmatter fields:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique subagent identifier |
| `name` | No | Display name (defaults to `id`) |
| `description` | No | Short description shown in tool listing |
| `model` | No | Model to use as `id` or `provider/id` |
| `capabilities` | No | `AgentCapabilityRule` for filtering available tools |

### run_subagent Tool

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent` | `string` | Yes | Subagent `id` or `name` to invoke |
| `task` | `string` | Yes | Task description to delegate |
| `context` | `string` | No | Additional context injected into the subagent |

### Capability Support

`SubagentPlugin` accepts a capability rule in its constructor config to control
which configured subagents are visible:

```typescript
const subagent = new SubagentPlugin({
  path: "./.cliagent/subagent/",
  capabilities: { deny: ["dangerous-agent"] },
}, factory);
```

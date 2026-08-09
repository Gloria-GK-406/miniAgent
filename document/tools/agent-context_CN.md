# agent-context

自动从项目和全局位置加载 Agent 框架配置文件，将其作为系统上下文注入。

## 行为

`AgentContextProvider` 扫描预定义位置的 Agent 框架配置文件，将其内容合并为一条系统消息注入到对话开头。

### 扫描位置

| 位置 | 说明 |
|------|------|
| `CLAUDE.md`、`AGENTS.md`、`GEMINI.md` | 项目级 Agent 指令 |
| `.github/copilot-instructions.md` | GitHub Copilot 指令 |
| `.cursorrules`、`.cursor/rules/` | Cursor 规则（`.mdc` 和 `.md`） |
| `.windsurfrules` | Windsurf 规则 |
| `CONVENTIONS.md` | 项目约定 |
| `replit.md`、`.gemini/styleguide.md`、`.junie/guidelines.md` | 其他 Agent 配置 |
| `.amazonq/rules/` | Amazon Q 规则 |
| `~/.claude/CLAUDE.md`、`~/.gemini/GEMINI.md` | 全局用户级指令 |

### 细节

- 超过 100KB 的文件会被截断
- `.mdc` 文件的 frontmatter 会被自动剥离
- 所有找到的文件合并为一条系统消息
- 如果未找到任何文件，不注入消息

## 注册

```typescript
import { AgentContextProvider } from "@piaoxianguo/miniagent-extensions";

const contextProvider = new AgentContextProvider(process.cwd());
agent.register(contextProvider);
```

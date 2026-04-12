# agent-context

Automatically loads agent framework configuration files from project and global locations, injecting them as system context.

## Behavior

`AgentContextProvider` scans predefined locations for agent framework configuration files and merges their contents into a single system message injected at the start of the conversation.

### Scanned Locations

| Location | Description |
|----------|-------------|
| `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` | Project-level agent instructions |
| `.github/copilot-instructions.md` | GitHub Copilot instructions |
| `.cursorrules`, `.cursor/rules/` | Cursor rules (`.mdc` and `.md`) |
| `.windsurfrules` | Windsurf rules |
| `CONVENTIONS.md` | Project conventions |
| `replit.md`, `.gemini/styleguide.md`, `.junie/guidelines.md` | Other agent configs |
| `.amazonq/rules/` | Amazon Q rules |
| `~/.claude/CLAUDE.md`, `~/.gemini/GEMINI.md` | Global user-level instructions |

### Details

- Files larger than 100KB are truncated
- `.mdc` files have their frontmatter stripped automatically
- All found files are merged into a single system message
- If no files are found, no message is injected

## Registration

```typescript
import { AgentContextProvider } from "@piaoxianguo/miniagent";

const contextProvider = new AgentContextProvider(process.cwd());
agent.register(contextProvider);
```

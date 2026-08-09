# skill

Load skill instructions from `SKILL.md` manifests in configurable directories.

## Setup

```typescript
import { SkillPlugin } from "@piaoxianguo/miniagent/extensions/skill";

const skill = new SkillPlugin({
  directories: ["./skills/", "~/.cliagent/skills/"],
});
await skill.initialize();
agent.register(skill);
```

## Configuration

Pass skill directories to the plugin constructor:

```json
{
  "directories": ["./skills/", "~/.cliagent/skills/"],
  "capabilities": { "allow": ["my-skill"] }
}
```

## Skill Definition

Each skill directory should contain a `SKILL.md` with frontmatter:

```markdown
---
id: my-skill
name: My Skill
description: A custom skill for X
---

Skill instructions go here...
```

## Behavior

- Scans configured directories for `SKILL.md` files
- Exposes skills as context messages and a `load_skill` tool
- When a skill is loaded, its instructions are injected into the agent context

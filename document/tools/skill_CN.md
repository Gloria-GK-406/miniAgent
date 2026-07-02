# skill

从可配置目录中的 `SKILL.md` 清单加载技能指令。

## 设置

```typescript
import { SkillPlugin } from "@piaoxianguo/miniagent/tool/skill";

const skill = new SkillPlugin({
  directories: ["./skills/", "~/.cliagent/skills/"],
});
await skill.initialize();
agent.register(skill);
```

## 配置

将技能目录传给插件构造函数：

```json
{
  "directories": ["./skills/", "~/.cliagent/skills/"],
  "capabilities": { "allow": ["my-skill"] }
}
```

## 技能定义

每个技能目录应包含带 frontmatter 的 `SKILL.md`：

```markdown
---
id: my-skill
name: 我的技能
description: 用于 X 的自定义技能
---

技能指令内容...
```

## 行为

- 扫描配置的目录查找 `SKILL.md` 文件
- 将技能作为上下文消息和 `load_skill` 工具暴露
- 加载技能时，其指令会注入到 Agent 上下文中

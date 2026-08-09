# glob

按 glob 模式查找文件。支持 `**`、`*` 和 `?` 通配符。

## 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pattern` | `string` | 是 | glob 匹配模式（如 `**/*.ts`） |
| `path` | `string` | 是 | 搜索的根目录 |

## 行为

- 从 `path` 开始递归遍历目录树
- 对文件（不含目录）进行 glob 模式匹配
- 支持标准 glob 通配符：
  - `*` — 匹配单个路径段内的任意字符
  - `**` — 匹配任意数量的路径段
  - `?` — 匹配单个字符
- 返回匹配的文件路径（相对于 `path`），每行一个
- 如果没有匹配结果，返回 "No files matched the pattern."

## 示例

```json
{ "pattern": "**/*.ts", "path": "/home/user/project/src" }
```

```json
{ "pattern": "src/**/*.test.ts", "path": "/home/user/project" }
```

```json
{ "pattern": "*.json", "path": "/home/user/project" }
```

## 注册

```typescript
import { globTool } from "@piaoxianguo/miniagent-extensions";
agent.register(globTool);
```

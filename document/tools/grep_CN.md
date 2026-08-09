# grep

使用正则表达式搜索文件内容。支持 include glob 过滤文件。

## 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pattern` | `string` | 是 | 正则表达式搜索模式 |
| `path` | `string` | 是 | 要搜索的目录或文件 |
| `include` | `string` | 否 | 文件 glob 过滤（如 `*.ts`） |

## 行为

- 如果 `path` 是目录，递归搜索目录树中的所有文件
- 如果 `path` 是单个文件，仅搜索该文件
- 当提供 `include` 时，仅搜索匹配 glob 模式的文件
- 输出格式：`{相对路径}:{行号}: {匹配行}`
- 如果没有匹配结果，返回 "No matches found."

## 示例

搜索目录中的所有文件：

```json
{ "pattern": "TODO", "path": "/home/user/project/src" }
```

仅搜索 TypeScript 文件：

```json
{ "pattern": "export\\s+function", "path": "/home/user/project/src", "include": "*.ts" }
```

搜索单个文件：

```json
{ "pattern": "import.*from", "path": "/home/user/project/src/index.ts" }
```

## 注册

```typescript
import { grepTool } from "@piaoxianguo/miniagent-extensions";
agent.register(grepTool);
```

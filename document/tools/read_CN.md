# read

读取文件或目录。对于文件，返回内容（支持行范围）。对于目录，返回条目名称。

## 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 是 | 文件或目录的绝对路径 |
| `offset` | `number` | 否 | 起始行号（从 1 开始） |
| `limit` | `number` | 否 | 最大读取行数 |

## 行为

- 如果 `path` 指向**目录**，返回条目名称列表（每行一个）
- 如果 `path` 指向**文件**，返回文件内容
- 当提供 `offset` 和/或 `limit` 时，仅返回指定行范围（从 1 开始索引）
- 如果路径不存在，返回错误信息

## 示例

```json
{ "path": "/home/user/project/src" }
```

```json
{ "path": "/home/user/project/src/index.ts" }
```

```json
{ "path": "/home/user/project/src/index.ts", "offset": 10, "limit": 50 }
```

## 注册

```typescript
import { readTool } from "@piaoxianguo/miniagent-extensions";
agent.register(readTool);
```

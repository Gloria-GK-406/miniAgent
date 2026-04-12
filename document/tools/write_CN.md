# write

写入文件。自动创建父目录，覆盖已有文件。

## 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 是 | 文件的绝对写入路径 |
| `content` | `string` | 是 | 要写入的文件内容 |

## 行为

- 自动创建所有不存在的父目录
- 如果文件已存在，会覆盖原文件
- 返回包含文件路径的成功信息

## 示例

```json
{ "path": "/home/user/project/src/hello.ts", "content": "console.log('hello');" }
```

## 注册

```typescript
import { writeTool } from "@piaoxianguo/miniagent";
agent.register(writeTool);
```

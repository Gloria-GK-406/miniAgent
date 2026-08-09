# bash

执行 bash 命令。返回 stdout、stderr 和退出码。支持超时和工作目录。

## 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `command` | `string` | 是 | 要执行的 bash 命令 |
| `timeout` | `number` | 否 | 超时时间（毫秒，最大 600000，默认 120000） |
| `workdir` | `string` | 否 | 命令执行的工作目录 |

## 行为

- 通过 `child_process.exec` 执行命令
- 默认超时 120 秒（120000ms），最大 600 秒
- 最大缓冲区大小为 10MB
- 输出包含 stdout 和 stderr
- 超时时追加 `[Process timed out after Xms]`
- 非零退出码时追加 `[Exit code: N]`
- 如果命令无输出，返回 `[No output]`

## 示例

```json
{ "command": "npm run build" }
```

```json
{ "command": "npm test", "timeout": 30000 }
```

```json
{ "command": "git status", "workdir": "/home/user/project" }
```

## 注册

```typescript
import { bashTool } from "@piaoxianguo/miniagent-extensions";
agent.register(bashTool);
```

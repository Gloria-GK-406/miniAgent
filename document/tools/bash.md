# bash

Execute a bash command. Returns stdout, stderr, and exit code. Supports timeout and working directory.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | `string` | Yes | The bash command to execute |
| `timeout` | `number` | No | Timeout in milliseconds (max 600000, default 120000) |
| `workdir` | `string` | No | Working directory for command execution |

## Behavior

- Executes the command via `child_process.exec`
- Default timeout is 120 seconds (120000ms), maximum is 600 seconds
- Max buffer size is 10MB
- Output includes stdout and stderr
- On timeout, appends `[Process timed out after Xms]`
- On non-zero exit, appends `[Exit code: N]`
- Returns `[No output]` if the command produces no output

## Examples

```json
{ "command": "npm run build" }
```

```json
{ "command": "npm test", "timeout": 30000 }
```

```json
{ "command": "git status", "workdir": "/home/user/project" }
```

## Registration

```typescript
import { bashTool } from "@piaoxianguo/miniagent-extensions";
agent.register(bashTool);
```

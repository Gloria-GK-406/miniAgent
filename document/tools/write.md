# write

Write content to a file. Creates parent directories if needed. Overwrites existing files.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | `string` | Yes | Absolute path to write the file |
| `content` | `string` | Yes | Content to write to the file |

## Behavior

- Automatically creates all parent directories if they don't exist
- Overwrites the file if it already exists
- Returns a success message with the file path

## Examples

```json
{ "path": "/home/user/project/src/hello.ts", "content": "console.log('hello');" }
```

## Registration

```typescript
import { writeTool } from "@piaoxianguo/miniagent";
agent.register(writeTool);
```

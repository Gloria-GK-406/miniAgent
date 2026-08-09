# read

Read a file or directory. For files, returns content with optional line range. For directories, returns entry names.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | `string` | Yes | Absolute path to the file or directory |
| `offset` | `number` | No | Line number to start reading from (1-indexed) |
| `limit` | `number` | No | Maximum number of lines to read |

## Behavior

- If `path` points to a **directory**, returns a list of entry names (one per line)
- If `path` points to a **file**, returns the file content
- When `offset` and/or `limit` are provided, returns only the specified line range (1-indexed)
- Returns an error message if the path does not exist

## Examples

```json
{ "path": "/home/user/project/src" }
```

```json
{ "path": "/home/user/project/src/index.ts" }
```

```json
{ "path": "/home/user/project/src/index.ts", "offset": 10, "limit": 50 }
```

## Registration

```typescript
import { readTool } from "@piaoxianguo/miniagent-extensions";
agent.register(readTool);
```

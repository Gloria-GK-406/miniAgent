# edit

Perform exact string replacement in a file. Fails if `oldString` is not found or found multiple times (unless `replaceAll` is true).

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | `string` | Yes | Absolute path to the file to edit |
| `oldString` | `string` | Yes | Exact text to find and replace |
| `newString` | `string` | Yes | Text to replace with |
| `replaceAll` | `boolean` | No | Replace all occurrences instead of just the first |

## Behavior

- Reads the file and searches for an exact match of `oldString`
- If `oldString` is not found, returns an error
- If `oldString` is found multiple times and `replaceAll` is not set, returns an error suggesting to use `replaceAll: true` or provide more context to make the match unique
- When `replaceAll` is `true`, replaces every occurrence of `oldString` with `newString`
- Returns a success message with the file path

## Examples

Single replacement:

```json
{ "path": "/home/user/project/src/index.ts", "oldString": "console.log('hello')", "newString": "console.log('world')" }
```

Replace all occurrences:

```json
{ "path": "/home/user/project/src/index.ts", "oldString": "var ", "newString": "const ", "replaceAll": true }
```

## Registration

```typescript
import { editTool } from "@piaoxianguo/miniagent";
agent.register(editTool);
```

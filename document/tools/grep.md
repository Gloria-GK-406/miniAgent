# grep

Search file contents using regular expressions. Supports include glob to filter files.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | `string` | Yes | Regular expression pattern to search for |
| `path` | `string` | Yes | Directory or file to search in |
| `include` | `string` | No | File glob to filter (e.g. `*.ts`) |

## Behavior

- If `path` is a directory, recursively searches all files in the directory tree
- If `path` is a single file, searches only that file
- When `include` is provided, only files matching the glob pattern are searched
- Output format: `{relativePath}:{lineNumber}: {matchedLine}`
- Returns "No matches found." if nothing matches

## Examples

Search all files in a directory:

```json
{ "pattern": "TODO", "path": "/home/user/project/src" }
```

Search only TypeScript files:

```json
{ "pattern": "export\\s+function", "path": "/home/user/project/src", "include": "*.ts" }
```

Search a single file:

```json
{ "pattern": "import.*from", "path": "/home/user/project/src/index.ts" }
```

## Registration

```typescript
import { grepTool } from "@piaoxianguo/miniagent";
agent.register(grepTool);
```

# glob

Find files matching a glob pattern. Supports `**`, `*`, and `?` wildcards.

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | `string` | Yes | Glob pattern to match (e.g. `**/*.ts`) |
| `path` | `string` | Yes | Base directory to search from |

## Behavior

- Recursively walks the directory tree starting from `path`
- Matches files (not directories) against the glob pattern
- Supports standard glob wildcards:
  - `*` — matches any characters within a single path segment
  - `**` — matches any number of path segments
  - `?` — matches a single character
- Returns matching file paths (relative to `path`), one per line
- Returns "No files matched the pattern." if nothing matches

## Examples

```json
{ "pattern": "**/*.ts", "path": "/home/user/project/src" }
```

```json
{ "pattern": "src/**/*.test.ts", "path": "/home/user/project" }
```

```json
{ "pattern": "*.json", "path": "/home/user/project" }
```

## Registration

```typescript
import { globTool } from "@piaoxianguo/miniagent";
agent.register(globTool);
```

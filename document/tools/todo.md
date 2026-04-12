# todo

Create, update, and delete todo items. The todo list is automatically injected into the agent context as a system message at the end of each context build.

## Tools

`TodoManager` implements both `ToolProvider` and `ContextProcessor`. It registers three tools:

### todo_create

Create a new todo item.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | `string` | Yes | Description of the todo item |

### todo_update

Update a todo item's content or status.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | Yes | ID of the todo item |
| `content` | `string` | No | New description |
| `status` | `string` | No | New status: `"pending"`, `"in_progress"`, or `"completed"` |

### todo_delete

Delete a todo item by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | Yes | ID of the todo item to delete |

## Context Injection

When todos exist, `TodoManager` appends a system message to the context with the current todo list:

```
## Todo List
1. [pending] Implement auth (id: abc-123)
2. [in_progress] Write tests (id: def-456)
3. [completed] Setup project (id: ghi-789)
```

## Capability Support

`TodoManager` implements `AgentCapabilityAware`. Use capability rules to control which todo tools are available:

```typescript
const capabilities = {
  tool: { deny: ["todo_delete"] }
};
```

## Registration

```typescript
import { TodoManager } from "@piaoxianguo/miniagent";
agent.register(new TodoManager());
```

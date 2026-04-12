# todo

创建、更新和删除待办事项。待办列表会在每次上下文构建时自动以系统消息的形式注入到 Agent 上下文末尾。

## 工具

`TodoManager` 同时实现 `ToolProvider` 和 `ContextProcessor`。它注册三个工具：

### todo_create

创建新的待办事项。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | `string` | 是 | 待办事项的描述 |

### todo_update

更新待办事项的内容或状态。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | 是 | 待办事项的 ID |
| `content` | `string` | 否 | 新的描述 |
| `status` | `string` | 否 | 新状态：`"pending"`、`"in_progress"` 或 `"completed"` |

### todo_delete

按 ID 删除待办事项。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | 是 | 要删除的待办事项 ID |

## 上下文注入

当有待办事项时，`TodoManager` 会在上下文末尾追加一条包含当前待办列表的系统消息：

```
## Todo List
1. [pending] 实现认证功能 (id: abc-123)
2. [in_progress] 编写测试 (id: def-456)
3. [completed] 项目初始化 (id: ghi-789)
```

## 能力支持

`TodoManager` 实现了 `AgentCapabilityAware`。可通过能力规则控制哪些 todo 工具可用：

```typescript
const capabilities = {
  tool: { deny: ["todo_delete"] }
};
```

## 注册

```typescript
import { TodoManager } from "@piaoxianguo/miniagent";
agent.register(new TodoManager());
```

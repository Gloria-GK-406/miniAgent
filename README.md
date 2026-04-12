# MiniAgent

A minimal, extensible TypeScript Agent framework. Simple by default, powerful when needed.

[中文文档](./README_CN.md)

## Design Philosophy

MiniAgent is built around a few core ideas:

- **Single Entry Point** — One `MiniAgent` class with a unified `register()` API. No complex configuration hierarchies, no boilerplate.
- **Schema-Driven Types** — All data structures are defined as Zod schemas. TypeScript types are derived automatically. Runtime validation comes for free.
- **Plugin Over Framework** — The core does one thing well (the agent loop). Everything else — tools, context providers, processors, MCP, skills, subagents — is a pluggable component registered through the same `register()` method.
- **Auto-Detection** — Components are identified by Zod schema validation, not manual type tags. You register a tool, a provider, or a processor — the agent knows what it is.

## Hooks

The framework exposes extension hooks at every layer of the agent loop:

### Component Registration

Everything goes through `register()`. The agent auto-detects component types:

```typescript
agent.register(tool);              // Tool
agent.register(toolProvider);      // ToolProvider
agent.register(contextProvider);   // ContextProvider
agent.register(contextProcessor);  // ContextProcessor
agent.register(messageNotifier);   // MessageNotifier
agent.register(errorHandler);      // ErrorHandler
agent.register(afterTurnProcessor);// AfterTurnProcessor
agent.register(configNotifier);    // ConfigNotifier
agent.register(persistRequire);    // PersistRequire
agent.register(turnContextAware);  // TurnContextAware
agent.register(turnContextAppend); // TurnContextAppend
agent.register(approver);          // ToolApprover
agent.register(agentModule);       // AgentModule
```

### ContextProvider

Inject additional context messages (sorted by `priority`):

```typescript
const provider = {
  priority: 0,
  async collect() {
    return [
      { id: crypto.randomUUID(), type: MessageType.System, content: "Custom context" },
    ];
  },
};
```

### ContextProcessor

Transform the message list before sending to the LLM. Return `Action` objects:

```typescript
import { ActionType } from "@piaoxianguo/miniagent";

const processor = {
  priority: 100,
  async process(messages) {
    return [
      { type: ActionType.Delete, targetId: "old-message-id" },
      { type: ActionType.Replace, targetId: "msg-id", message: newMessage },
      { type: ActionType.AddFirst, message: systemMsg },
      { type: ActionType.AddLast, message: footerMsg },
    ];
  },
};
```

### Events

Full lifecycle events via `EventEmitter`:

```typescript
agent.on("run:start", ({ input }) => { /* agent run started */ });
agent.on("run:complete", ({ messages }) => { /* agent run finished */ });
agent.on("run:stop", () => { /* agent was stopped */ });
agent.on("run:error", ({ error, turn }) => { /* unhandled error */ });
agent.on("turn:start", ({ turn }) => { /* new turn began */ });
agent.on("turn:end", ({ turn }) => { /* turn finished */ });
agent.on("llm:request", ({ context, tools }) => { /* LLM request about to be made */ });
agent.on("llm:chunk", ({ chunk }) => { /* streaming chunk received */ });
agent.on("llm:response", ({ response }) => { /* full LLM response received */ });
agent.on("tool:execute", ({ toolCall }) => { /* tool execution started */ });
agent.on("tool:result", ({ toolCall, result }) => { /* tool execution completed */ });
agent.on("message:notify", ({ message }) => { /* new message created */ });
```

### Tool Approval (HITL)

Implement `ToolApprover` to add human confirmation before tool execution:

```typescript
const approver = {
  async requestApproval(toolName, args) {
    const answer = await askUser(`Allow ${toolName}?`);
    if (answer === "always") return "approve_all";
    return answer ? "approve" : "deny";
  },
};
agent.register(approver);
agent.setAutoApprovedTools(["read", "glob", "grep"]);
```

### Error Handling

Register `ErrorHandler` components to handle errors within the agent loop:

```typescript
const handler = {
  priority: 0,
  canHandle(error) {
    return error instanceof RateLimitError;
  },
  async handle(error) {
    await delay(5000);
  },
};
agent.register(handler);
```

Throw `StopException` to gracefully stop the agent loop:

```typescript
import { StopException } from "@piaoxianguo/miniagent";
throw new StopException("Task complete");
```

### Blueprint Assembly

Build agents from declarative blueprints:

```typescript
import { AgentAssembler, AgentBlueprintRegistry } from "@piaoxianguo/miniagent";

const registry = new AgentBlueprintRegistry();
registry.register("tool.read", () => readTool);
registry.register("plugin.mcp", () => new McpPlugin());

const assembler = new AgentAssembler(registry);
const agent = await assembler.assemble({
  llm: engines,
  config: agentConfig,
  blueprint: { uses: ["tool.read", "plugin.mcp"] },
  capabilities: { tool: { deny: ["bash"] } },
});
```

### Capability System

Control visibility of tools, plugins, and subagents with allow/deny patterns:

```typescript
const capabilities = {
  tool: { allow: ["read", "glob", "grep"], deny: ["bash"] },
  mcp: {
    server: { allow: ["filesystem"] },
    tool: { deny: ["mcp__filesystem__write_file"] },
  },
  skill: { allow: ["*"] },
  subagent: { deny: ["dangerous-agent"] },
};
```

## Getting Started

### Installation

```bash
npm install @piaoxianguo/miniagent
```

### Using the Class Directly

```typescript
import { MiniAgent, LLMEngineManager, MessageType } from "@piaoxianguo/miniagent";
import { AnthropicEngine } from "@piaoxianguo/miniagent/engine/anthropic";
import { z } from "zod";

const engines = new LLMEngineManager();
engines.register("anthropic", AnthropicEngine);

const agent = new MiniAgent(engines, {
  model: {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY!,
    baseUrl: "",
  },
  models: new Map(),
  plugins: new Map(),
  paths: {
    sessiondir: "./sessions",
  },
});

agent.on("llm:chunk", ({ chunk }) => {
  if (chunk.type === "text-delta") process.stdout.write(chunk.text);
});

agent.register({
  name: "get_weather",
  description: "Get weather for a city",
  parameters: z.object({
    city: z.string().describe("City name"),
  }),
  execute: async (args) => `${args.city}: Sunny, 25°C`,
});

const messages = await agent.run({
  id: crypto.randomUUID(),
  type: MessageType.User,
  content: "What's the weather in Beijing?",
});
```

### Using the Factory Function

```typescript
import { createMiniAgent, LLMEngineManager } from "@piaoxianguo/miniagent";
import { AnthropicEngine } from "@piaoxianguo/miniagent/engine/anthropic";

const engines = new LLMEngineManager();
engines.register("anthropic", AnthropicEngine);

const agent = createMiniAgent({
  llm: engines,
  config: {
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKey: process.env.ANTHROPIC_API_KEY!,
      baseUrl: "",
    },
    models: new Map(),
    plugins: new Map(),
    paths: { sessiondir: "./sessions" },
  },
  use: [
    myTool,
    myToolProvider,
    myContextProvider,
    (agent) => {
      agent.on("llm:chunk", ({ chunk }) => {
        if (chunk.type === "text-delta") process.stdout.write(chunk.text);
      });
    },
  ],
});
```

### Agent Methods

| Method | Description |
|--------|-------------|
| `run(input)` | Run the agent loop with a user message. Returns all messages. |
| `stop()` | Stop the running agent loop. |
| `register(item)` | Register a component (tool, provider, processor, etc.) |
| `on(event, listener)` | Subscribe to lifecycle events. |
| `getMessages()` | Get all messages in the session. |
| `getMessage(id)` | Get a specific message by ID. |
| `getToolList()` | Get all currently available tools. |
| `previewContext()` | Preview the context that will be sent to the LLM. |
| `setDiscardBefore(id)` | Set a watermark to discard messages before the given ID. |
| `setModel(config)` | Switch to a different model at runtime. |
| `setModelByPath(path)` | Switch model by `provider/model` path string. |
| `setAutoApprovedTools(names)` | Set tools that bypass HITL approval. |
| `getConfig()` | Get the current agent configuration. |
| `getContextCount()` | Get cumulative token usage statistics. |

## Built-in Tools

| Tool | Description | Docs |
|------|-------------|------|
| `read` | Read file contents or list directory entries | [read.md](./document/tools/read.md) |
| `write` | Write content to a file (creates parent dirs) | [write.md](./document/tools/write.md) |
| `edit` | Exact string replacement in files | [edit.md](./document/tools/edit.md) |
| `glob` | Find files by glob pattern (`**/*.ts`, etc.) | [glob.md](./document/tools/glob.md) |
| `grep` | Search file contents with regex | [grep.md](./document/tools/grep.md) |
| `bash` | Execute bash commands with timeout and working directory | [bash.md](./document/tools/bash.md) |
| `todo` | Create, update, delete todo items | [todo.md](./document/tools/todo.md) |
| `subagent` | File-based subagent management with `run_subagent` tool | [subagent.md](./document/tools/subagent.md) |
| `agent-context` | Auto-load agent framework config files into context | [agent-context.md](./document/tools/agent-context.md) |
| `mcp` | MCP client with stdio / SSE / Streamable HTTP transports | [mcp.md](./document/tools/mcp.md) |
| `skill` | Load skill instructions from `SKILL.md` manifests | [skill.md](./document/tools/skill.md) |

## CLI

Interactive REPL with model switching, session management, HITL toggle, and more.

```bash
npm run chat
```

→ [CLI Documentation](./document/cli/repl.md)

## LLM Engines

Manage multiple LLM engines via `LLMEngineManager`:

```typescript
import { LLMEngineManager } from "@piaoxianguo/miniagent";
import { AnthropicEngine } from "@piaoxianguo/miniagent/engine/anthropic";
import { OpenAIEngine } from "@piaoxianguo/miniagent/engine/openai";
import { OpenAICompatibleEngine } from "@piaoxianguo/miniagent/engine/openai-compatible";
import { GLMEngine } from "@piaoxianguo/miniagent/engine/glm";
import { GLMCodePlanEngine } from "@piaoxianguo/miniagent/engine/glm-codeplan";

const engines = new LLMEngineManager();
engines.register("anthropic", AnthropicEngine);
engines.register("openai", OpenAIEngine);
engines.register("openai-compatible", OpenAICompatibleEngine);
engines.register("glm", GLMEngine);
engines.register("glm-codeplan", GLMCodePlanEngine);
```

Engines are LRU-cached by `ModelConfig`. Implement the `LLMEngine` interface to create custom engines.

### ModelConfig

```typescript
interface ModelConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  thinking?: boolean;
  maxTokens?: number;
  contextSize?: number;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
}
```

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript (strict, ESM, `verbatimModuleSyntax`)
- **Schema**: Zod (beta, v3-compatible API)
- **Test**: Vitest
- **Lint**: ESLint (typescript-eslint)
- **SDKs**: `@anthropic-ai/sdk`, `openai`, `@modelcontextprotocol/sdk`
- **Utils**: `eventemitter3`, `lru-cache`, `zod-to-json-schema`

## License

MIT

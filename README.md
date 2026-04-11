# MiniAgent

A minimal, extensible TypeScript Agent framework. Simple by default, powerful when needed.

[中文文档](./README_CN.md)

## Features

- **Minimal Core** — Single `MiniAgent` class with a unified `register()` API for all components
- **Extensible LLM Engines** — Built-in Anthropic / OpenAI / OpenAI-Compatible / GLM / GLM-CodePlan, fully customizable
- **Streaming** — Native streaming with text-delta, reasoning-delta, and tool-call-arguments-delta chunks
- **Tool System** — Register tools with Zod schemas; automatic tool-call loop
- **Context Management** — `ContextProvider` / `ContextProcessor` / `TurnContextAware` for flexible context window control
- **Context Compression** — Built-in `ContextCompressor` that summarizes old messages when thresholds are exceeded
- **Message Persistence** — JSONL-based message store with watermark-based discarding
- **Tool Approval (HITL)** — Human-in-the-Loop mechanism: approve, deny, or auto-approve tool calls
- **Event System** — Full lifecycle events via `EventEmitter` (run, turn, llm, tool, message)
- **MCP Plugin** — Built-in Model Context Protocol client with stdio / SSE / Streamable HTTP transports
- **Skill Plugin** — Load skill instructions from `SKILL.md` manifests in configurable directories
- **Built-in Tools** — File operations (read, write, edit), search (glob, grep), bash execution, todo management, sub-agent spawning
- **Session Management** — Create, switch, rename, delete sessions with per-session persistence
- **Configuration System** — Layered config with file loader, aggregator, resolver, and runtime service
- **CLI** — Interactive REPL with model switching, session management, HITL toggle, context preview, and more

## Installation

```bash
npm install @piaoxianguo/miniagent
```

## Quick Start

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

`createMiniAgent` provides a concise way to create an agent with all components in one call:

```typescript
import { createMiniAgent, LLMEngineManager, MessageType } from "@piaoxianguo/miniagent";
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
    myTool,                       // Tool
    myToolProvider,                // ToolProvider
    myContextProvider,             // ContextProvider
    (agent) => {                   // Installer function
      agent.on("llm:chunk", ({ chunk }) => {
        if (chunk.type === "text-delta") process.stdout.write(chunk.text);
      });
    },
  ],
});
```

### Using the CLI

```bash
npm run chat
```

On first run, a `.cliagent/config.json` template is generated. Configure your models:

```json
{
  "models": [
    {
      "name": "claude",
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "apiKey": "sk-ant-..."
    }
  ],
  "defaultModel": "claude",
  "systemPrompt": "You are a helpful assistant."
}
```

## Core Concepts

### MiniAgent

The central class. Register tools, providers, processors, and other components via a single `register()` method:

```typescript
const agent = new MiniAgent(llmRequest, config);

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

The agent auto-detects component types via Zod schema validation — no need to specify what you're registering.

#### Agent Methods

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

### LLM Engines

Manage multiple LLM engines via `LLMEngineManager`. Engines are resolved by the `provider` field in `ModelConfig`:

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

Engines are LRU-cached by `ModelConfig`. Implement the `LLMEngine` interface to create custom engines:

```typescript
interface LLMEngine {
  streamGenerate(messages: Message[], tools: Tool[]): LLMStreamHandle<LLMResponse>;
}
```

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

### Tools

Tools use Zod schemas for parameter validation:

```typescript
import { z } from "zod";

const tool = {
  name: "search",
  description: "Search the web",
  parameters: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().optional().describe("Max results"),
  }),
  execute: async (args) => {
    return `Results for: ${args.query}`;
  },
};
agent.register(tool);
```

`ToolProvider` enables dynamic tool registration per turn:

```typescript
const provider = {
  async getTools() {
    return [tool1, tool2];
  },
};
agent.register(provider);
```

### Built-in Tools

The framework ships with ready-to-use tools:

| Tool | Description |
|------|-------------|
| `readTool` | Read file contents or list directory entries |
| `writeTool` | Write content to a file (creates parent dirs) |
| `editTool` | Exact string replacement in files |
| `globTool` | Find files by glob pattern (`**/*.ts`, etc.) |
| `grepTool` | Search file contents with regex |
| `bashTool` | Execute bash commands with timeout and working directory |
| `TodoManager` | Create, update, delete todo items; injects todo list into context |
| `SubAgentProvider` | Spawn sub-agents for delegated tasks |

### Context System

#### ContextProvider

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

#### ContextProcessor

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

#### TurnContextAware & TurnContextAppend

- `TurnContextAware` — Receives the current turn number and full context before each LLM call
- `TurnContextAppend` — Appends extra messages at the beginning of each context build

### Context Compression

`ContextCompressor` summarizes old messages when the conversation exceeds a threshold:

```typescript
import { ContextCompressor } from "@piaoxianguo/miniagent";

const compressor = new ContextCompressor(engines, modelConfig, {
  maxMessages: 50,
  keepRecent: 10,
});
agent.register(compressor);

// Call manually or after each run:
compressor.updateMessages(messages);
await compressor.maybeCompress();
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
    if (answer === "always") return "approve_all"; // auto-approve future calls
    return answer ? "approve" : "deny";
  },
};
agent.register(approver);

// Bypass HITL for safe tools:
agent.setAutoApprovedTools(["read", "glob", "grep"]);
```

Approval decisions: `"approve"` | `"deny"` | `"approve_all"`

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

Throw `StopException` from any component to gracefully stop the agent loop:

```typescript
import { StopException } from "@piaoxianguo/miniagent";
throw new StopException("Task complete");
```

### MCP Plugin

`McpPlugin` connects to MCP servers and exposes their tools to the agent:

```typescript
import { McpPlugin } from "@piaoxianguo/miniagent/tool/mcp";

const mcp = new McpPlugin();
agent.register(mcp);
```

Configure MCP servers in the agent config's `plugins.mcp`:

```json
{
  "plugins": {
    "mcp": {
      "servers": {
        "filesystem": {
          "transport": "stdio",
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
        },
        "remote": {
          "transport": "streamable-http",
          "url": "http://localhost:3000/mcp"
        }
      }
    }
  }
}
```

| Transport | Fields | Description |
|-----------|--------|-------------|
| `stdio` | `command`, `args?`, `env?` | Spawn a subprocess |
| `sse` | `url` | HTTP SSE connection (legacy) |
| `streamable-http` | `url` | Streamable HTTP (recommended) |

MCP tools are registered as `mcp__{serverName}__{toolName}` to avoid naming conflicts. `McpPlugin` implements both `ToolProvider` and `ConfigNotifier` — it dynamically rebuilds the tool list each turn; failed server connections are silently skipped.

### Skill Plugin

`SkillPlugin` scans directories for `SKILL.md` manifests and exposes them as context + a `load_skill` tool:

```typescript
import { SkillPlugin } from "@piaoxianguo/miniagent/tool/skill";

const skill = new SkillPlugin();
agent.register(skill);
```

Configure in `plugins.skill`:

```json
{
  "plugins": {
    "skill": {
      "directories": ["./skills/", "~/.cliagent/skills/"]
    }
  }
}
```

Each skill directory should contain a `SKILL.md` with frontmatter:

```markdown
---
id: my-skill
name: My Skill
description: A custom skill for X
---

Skill instructions go here...
```

### Session Management

`SessionManager` handles multi-session persistence:

```typescript
import { SessionManager } from "@piaoxianguo/miniagent";

const sessions = new SessionManager("./data");
await sessions.load();

const session = await sessions.create("my-session");
sessions.setActive(session.id);

// List, switch, rename, delete:
const list = sessions.list();
sessions.setActive("other-id");
await sessions.renameSession("id", "new-name");
await sessions.delete("id");
```

### Agent Modules

`defineAgentModule` creates typed, composable module objects that can be registered with the agent:

```typescript
import { defineAgentModule } from "@piaoxianguo/miniagent";

const module = defineAgentModule({
  priority: 0,
  async collect() {
    return [{ id: "ctx", type: MessageType.System, content: "Extra context" }];
  },
});
agent.register(module);
```

### Configuration System

The framework provides layered configuration utilities:

| Component | Description |
|-----------|-------------|
| `PersistentConfigFileLoader` | Load config from JSON files |
| `PersistentConfigAggregator` | Merge multiple config sources |
| `AgentConfigResolver` | Resolve config with runtime overrides |
| `AgentConfigService` | High-level config management service |

```typescript
import {
  PersistentConfigFileLoader,
  PersistentConfigAggregator,
  AgentConfigResolver,
  AgentConfigService,
} from "@piaoxianguo/miniagent";
```

### Message Types

| Type | Description |
|------|-------------|
| `SystemMessage` | System instruction |
| `UserMessage` | User input |
| `AssistMessage` | LLM text response (includes optional `reasoningContent`) |
| `ToolCallMessage` | LLM requesting tool execution |
| `ToolResultMessage` | Tool execution result |

### Streaming Chunk Types

| Type | Description |
|------|-------------|
| `TextDeltaChunk` | Incremental text content |
| `ReasoningDeltaChunk` | Incremental reasoning/thinking content |
| `ToolCallArgumentsDeltaChunk` | Incremental tool call arguments |

## CLI

The built-in CLI provides an interactive REPL with rich features:

```bash
npm run chat
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `/models` | List configured models |
| `/model <provider/model>` | Switch active model |
| `/tools` | List registered tools |
| `/history [page]` | View conversation history |
| `/context` | Preview context sent to LLM |
| `/compress` | Trigger context compression |
| `/session` | List all sessions |
| `/session new` | Create a new session |
| `/session switch <id>` | Switch to a session |
| `/session delete <id>` | Delete a session |
| `/session rename <id> <name>` | Rename a session |
| `/hitl [on\|off]` | Toggle human-in-the-loop |
| `/clear` | Clear current conversation |
| `/system <text>` | Update system prompt |
| `/help` | Show help |
| `/quit` | Exit |

## Project Structure

```
src/
  index.ts                    # Public API exports
  core/
    agent.ts                  # MiniAgent class — main loop
    create-agent.ts           # createMiniAgent factory
    module.ts                 # defineAgentModule helper
    types.ts                  # Zod schemas and type definitions
    llm.ts                    # LLMEngineManager, engine abstraction
    config.ts                 # Configuration schemas
    events.ts                 # Event type definitions
    errors.ts                 # StopException
    message-source.ts         # Message sequence management
    file-store.ts             # File-based storage utility
    session.ts                # SessionManager
  context/
    compressor.ts             # ContextCompressor
  tool/
    types.ts                  # Tool and ToolProvider schemas
    approver.ts               # ToolApprover (HITL)
    read.ts / write.ts / edit.ts  # File operation tools
    glob.ts / grep.ts         # Search tools
    bash.ts                   # Shell execution tool
    todo.ts                   # TodoManager tool + context processor
    subagent.ts               # SubAgentProvider
    mcp/                      # MCP plugin
    skill/                    # Skill plugin
  engine/
    anthropic/                # Anthropic Claude engine
    openai/                   # OpenAI engine
    openai-compatible/        # OpenAI-compatible protocol engine
    glm/                      # Zhipu GLM engine
    glm-codeplan/             # Zhipu GLM CodePlan engine
  cli/                        # Interactive CLI
  utils/config/               # Configuration utilities
```

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript (strict, ESM, `verbatimModuleSyntax`)
- **Schema**: Zod (beta, v3-compatible API)
- **Test**: Vitest
- **Lint**: ESLint (typescript-eslint)
- **SDKs**: `@anthropic-ai/sdk`, `openai`, `@modelcontextprotocol/sdk`
- **Utils**: `eventemitter3`, `lru-cache`, `zod-to-json-schema`

## Exports

```typescript
// Core
import { MiniAgent, createMiniAgent, defineAgentModule } from "@piaoxianguo/miniagent";
import { LLMEngineManager } from "@piaoxianguo/miniagent";
import { MessageSource, FileStore, SessionManager } from "@piaoxianguo/miniagent";
import { ContextCompressor } from "@piaoxianguo/miniagent";
import { StopException } from "@piaoxianguo/miniagent";

// Types & Enums
import { MessageType, ActionType, LLMStreamChunkType } from "@piaoxianguo/miniagent";

// Engines
import { AnthropicEngine } from "@piaoxianguo/miniagent/engine/anthropic";
import { OpenAIEngine } from "@piaoxianguo/miniagent/engine/openai";
import { OpenAICompatibleEngine } from "@piaoxianguo/miniagent/engine/openai-compatible";
import { GLMEngine } from "@piaoxianguo/miniagent/engine/glm";
import { GLMCodePlanEngine } from "@piaoxianguo/miniagent/engine/glm-codeplan";

// Plugins
import { McpPlugin } from "@piaoxianguo/miniagent/tool/mcp";
import { SkillPlugin } from "@piaoxianguo/miniagent/tool/skill";

// Config utilities
import {
  PersistentConfigFileLoader,
  PersistentConfigAggregator,
  AgentConfigResolver,
  AgentConfigService,
} from "@piaoxianguo/miniagent";
```

## License

MIT

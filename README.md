# MiniAgent

A minimal, extensible TypeScript Agent framework. Simple by default, powerful when needed.

[中文文档](./README_CN.md)

## Quick Start

```bash
npm install @piaoxianguo/miniagent
```

```typescript
import {
  MiniAgent,
  LLMEngineManager,
  MessageType,
} from "@piaoxianguo/miniagent";
import { OpenAIEngine } from "@piaoxianguo/miniagent/engine/openai";
import { z } from "zod";

// 1. Set up the LLM engine
const llm = new LLMEngineManager();
llm.register(new OpenAIEngine());

// 2. Create the agent
const agent = new MiniAgent({
  llm,
  config: {
    providers: [
      {
        provider: "openai",
        key: process.env.OPENAI_API_KEY!,
        models: [{ id: "fast", name: "gpt-4o-mini" }],
      },
    ],
    defaultModel: { id: "fast", provider: "openai" },
    generation: {
      temperature: 0.7,
      thinking: "medium",
    },
    plugins: new Map(),
    paths: { sessiondir: "./sessions" },
  },
});

console.log(agent.getModels().map((model) => model.id));
agent.setGenerationConfig({ temperature: 0.2, thinking: "none" });

// 3. Print streaming output
agent.on("llm:chunk", ({ chunk }) => {
  if (chunk.type === "text-delta") process.stdout.write(chunk.text);
});

// 4. Register a tool — that's it
agent.register({
  name: "get_weather",
  description: "Get the current weather for a city",
  parameters: z.object({
    city: z.string().describe("City name"),
  }),
  execute: async (args) => `${args.city}: Sunny, 25°C`,
});

// 5. Run
const messages = await agent.run({
  id: crypto.randomUUID(),
  type: MessageType.User,
  content: "What's the weather in Beijing?",
});
```

That's a fully working agent with streaming output and tool use. No boilerplate, no configuration files.

## Design Philosophy

MiniAgent is built on one principle: **a minimal core with free assembly**.

The core does exactly one thing — the agent loop (collect context → call LLM → execute tools → repeat). Everything else is a pluggable component you register through the same `register()` method:

```
                    ┌─────────────────────────────────┐
                    │           MiniAgent              │
                    │                                  │
   register() ───► │  Tool ───────────── execute()    │
                  ◄ │  ContextProvider ── collect()    │
                  ◄ │  ContextProcessor ─ process()    │
                  ◄ │  MessageNotifier ── notify()     │
                  ◄ │  ErrorHandler ───── handle()     │
                  ◄ │  ToolApprover ───── approve()    │
                  ◄ │  ...                             │
                    │                                  │
                    └─────────────────────────────────┘
```

- **Schema-Driven Types** — All data structures are defined as Zod schemas. TypeScript types are derived automatically. Runtime validation comes for free.
- **Auto-Detection** — Components are identified by Zod schema validation, not manual type tags. You register a tool, a provider, or a processor — the agent knows what it is.
- **Plugin Over Framework** — No inheritance hierarchies, no abstract base classes. Just plain objects that satisfy the right schema.

## Tools and Interfaces

### Tool

A tool is the simplest thing to define — a name, a description, a Zod parameter schema, and an `execute` function:

```typescript
const myTool: Tool = {
  name: "read_file",
  description: "Read the contents of a file",
  parameters: z.object({
    path: z.string().describe("Absolute file path"),
  }),
  execute: async (args) => {
    return fs.readFile(args.path, "utf-8");
  },
};

agent.register(myTool);
```

### ToolProvider

When you need to dynamically provide multiple tools (e.g. connecting to an MCP server), implement `ToolProvider`:

```typescript
const provider: ToolProvider = {
  async getTools(): Promise<Tool[]> {
    // Dynamically discover and return tools
    return [tool1, tool2, tool3];
  },
};

agent.register(provider);
```

### LLMRequire

Some components need access to the LLM (e.g. a context compressor that summarizes old messages). Implement `LLMRequire` and the agent will inject the `LLMRequest` at registration time:

```typescript
const compressor = {
  priority: -1000,
  private llm: null,

  async setLLMRequest(llm: LLMRequest) {
    this.llm = llm;
  },

  async collect() {
    // Use this.llm to summarize old messages...
    return [summaryMessage];
  },
};
```

### ContextProvider

Inject additional context messages into every turn. Sorted by `priority`:

```typescript
const provider = {
  priority: 0,
  async collect() {
    return [
      { id: crypto.randomUUID(), type: MessageType.System, content: "You are a helpful assistant." },
    ];
  },
};
```

### ContextProcessor

Transform the message list before it's sent to the LLM. Return `Action` objects to delete, replace, or inject messages:

```typescript
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

### Other Interfaces

| Interface | Purpose |
|-----------|---------|
| `MessageNotifier` | Called every time a new message is created |
| `ErrorHandler` | Handle errors within the agent loop (retry, fallback, etc.) |
| `ToolApprover` | Human-in-the-loop approval before tool execution |
| `AfterTurnProcessor` | Run logic after each agent run completes |
| `PersistRequire` | Receive the `Store` instance for persistence |
| `TurnContextConsumer` | Receive the full context of each turn |
| `TurnContextAppender` | Prepend messages before other context providers |
| `Destroyable` | Clean up resources when `MiniAgent.destroy()` is called |

## LLMRequest and LLMEngine

MiniAgent separates LLM interaction into two layers:

In provider mode, `MiniAgent` sends messages, tools, a resolved provider, a resolved model, and `GenerationConfig` to a registered engine instance.

- **`LLMRequest`** — The interface the agent calls: `streamInvoke(request)`.
- **`LLMEngine`** — The engine interface. Engines expose `name`, `getModels()`, and `streamGenerate(request)`.
- **`LLMEngineManager`** — The default `LLMRequest` implementation. It registers engine instances and routes resolved model requests.

```
  MiniAgent ──calls──► LLMRequest (interface)
                            │
                   LLMEngineManager (default impl)
                            │
                     ┌──────┴──────┐
                  LLMEngine     LLMEngine
                  (Anthropic)   (OpenAI)  ...
```

### Built-in Engines

```typescript
import { LLMEngineManager } from "@piaoxianguo/miniagent";
import { AnthropicEngine } from "@piaoxianguo/miniagent/engine/anthropic";
import { OpenAIEngine } from "@piaoxianguo/miniagent/engine/openai";
import { OpenAICompatibleEngine } from "@piaoxianguo/miniagent/engine/openai-compatible";
import { GLMEngine } from "@piaoxianguo/miniagent/engine/glm";
import { GLMCodePlanEngine } from "@piaoxianguo/miniagent/engine/glm-codeplan";

const engines = new LLMEngineManager();
engines.register(new AnthropicEngine());
engines.register(new OpenAIEngine());
engines.register(new OpenAICompatibleEngine());
engines.register(new GLMEngine());
engines.register(new GLMCodePlanEngine());
```

Provider-mode engines expose a model catalog and receive a per-request provider, resolved model, and generation object:

```typescript
interface LLMEngine {
  readonly name: string;
  getModels(): ModelPreset[];
  streamGenerate(request: LLMGenerateRequest): AsyncGenerator<MessageChunk>;
}
```

## Blueprint and Assembly

For real-world applications, you don't want to register every component manually. MiniAgent provides a **Blueprint** system for declarative agent assembly.

### Blueprint

A blueprint is a declarative description of agent-level components. Each slot
uses the same `{ use, config }` shape, but the slot gives the component semantic
meaning:

```typescript
const blueprint = {
  engines: [{ use: "openai" }],
  persistence: {
    use: "file",
    config: { rootDir: ".miniagent", fileName: "session.json" },
  },
  compression: {
    use: "summary",
    config: { maxMessages: 60, keepRecent: 15 },
  },
  tools: [{ use: "read" }, { use: "grep" }, { use: "bash" }],
  mcp: { use: "config", config: { servers: {} } },
};
```

### Blueprint Manager

Register implementations for semantic component slots, then assemble an agent
from the blueprint:

```typescript
import {
  BlueprintManager,
  registerBuiltinBlueprintImpls,
} from "@piaoxianguo/miniagent";

const manager = new BlueprintManager();
registerBuiltinBlueprintImpls(manager, {
  subagentFactory,
  getAgentConfig: () => agentConfig,
});

const agent = await manager.assemble({
  config: agentConfig,
  blueprint,
});
```

### Capability System

Some blueprint implementations accept capability rules in their own `config` to
control which MCP servers/tools, skills, or subagents are visible:

```typescript
const blueprint = {
  mcp: {
    use: "config",
    config: {
      servers,
      capabilities: {
        server: { allow: ["filesystem"] },
        tool: { deny: ["mcp__filesystem__write_file"] },
      },
    },
  },
  skill: {
    use: "local-directory",
    config: { directories: ["skill/"], capabilities: { allow: ["*"] } },
  },
  subagent: {
    use: "local-directory-sync",
    config: { path: "subagent/", capabilities: { deny: ["dangerous-agent"] } },
  },
};
```

### Factory Function

For simpler cases, use `createMiniAgent` with the `use` array — a flat list of tools, providers, modules, or setup functions:

```typescript
import { createMiniAgent } from "@piaoxianguo/miniagent";

const agent = createMiniAgent({
  llm: engines,
  config: agentConfig,
  use: [
    readTool,
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
| `subagent` | Delegate tasks to file-defined sub-agents | [subagent.md](./document/tools/subagent.md) |
| `agent-context` | Auto-load agent framework config files into context | [agent-context.md](./document/tools/agent-context.md) |
| `mcp` | MCP client with stdio / SSE / Streamable HTTP transports | [mcp.md](./document/tools/mcp.md) |
| `skill` | Load skill instructions from `SKILL.md` manifests | [skill.md](./document/tools/skill.md) |

## Built-in CLI

MiniAgent ships with an interactive REPL built with Ink (React for CLI):

```bash
npm run chat
```

On first run, a `.cliagent/config.json` template is generated. Configure your models and run again:

```json
{
  "providers": [
    {
      "engine": "anthropic",
      "key": "sk-ant-...",
      "models": [{ "id": "sonnet", "name": "claude-sonnet-4-5" }]
    },
    {
      "engine": "openai-compatible",
      "key": "local",
      "baseURL": "http://localhost:11434/v1",
      "models": [{ "id": "local", "name": "qwen2.5-coder" }]
    }
  ],
  "defaultModel": "sonnet",
  "generation": {
    "temperature": 0.7,
    "thinking": "medium"
  }
}
```

### CLI Commands

| Command | Description |
|---------|-------------|
| `/models` | List resolved model ids |
| `/model <id\|provider/id>` | Switch active model by resolved id |
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
| `/quit` | Exit |

→ [Full CLI Documentation](./document/cli/repl.md)

## Events

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

## Agent API

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
| `getModels()` / `getResolvedModels()` | Get resolved provider-qualified model catalog entries. |
| `getCurrentResolvedModel()` | Get the active resolved model. |
| `setResolvedModel(selector)` | Switch active model by `{ id }` or `{ provider, model }`. |
| `getGenerationConfig()` | Get generation preferences such as temperature and thinking level. |
| `setGenerationConfig(update)` | Update generation preferences without changing the active model. |
| `setAutoApprovedTools(names)` | Set tools that bypass HITL approval. |
| `getConfig()` | Get the current agent configuration. |
| `getContextCount()` | Get cumulative token usage statistics. |

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

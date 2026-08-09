import type {
    AfterTurnProcessor,
    ContextProcessor,
    ContextProvider,
    Destroyable,
    ErrorHandler,
    LLMRequire,
    MessageNotifier,
    TurnContextAppender,
    TurnContextConsumer,
} from "./types.js";
import type { PersistRequire } from "./persistence.js";
import type { OneShotLLMRequire } from "./one-shot-llm.js";
import type { Tool, ToolApprover, ToolProvider } from "./tool.js";

export type AgentRegistrable =
    | Tool
    | ToolProvider
    | ContextProvider
    | ContextProcessor
    | MessageNotifier
    | ErrorHandler
    | AfterTurnProcessor
    | PersistRequire
    | TurnContextConsumer
    | TurnContextAppender
    | ToolApprover
    | LLMRequire
    | OneShotLLMRequire
    | Destroyable;

export type AgentModule = Record<string, unknown>;

export function defineAgentModule<T extends AgentModule>(module: T): T {
    return module;
}

import type {
    AfterTurnProcessor,
    ContextProcessor,
    ContextProvider,
    Destroyable,
    ErrorHandler,
    LLMRequire,
    MessageNotifier,
    PersistRequire,
    TurnContextAppender,
    TurnContextConsumer,
} from "./types.js";
import type { OneShotLLMRequire } from "./one-shot-llm.js";
import type { ToolProvider, Tool } from "../tool/types.js";
import type { ToolApprover } from "../tool/approver.js";

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

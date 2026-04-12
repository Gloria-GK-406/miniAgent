import type {
    AfterTurnProcessor,
    ConfigNotifier,
    ContextProcessor,
    ContextProvider,
    ErrorHandler,
    MessageNotifier,
    PersistRequire,
    TurnContextAppender,
    TurnContextConsumer,
} from "./types.js";
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
    | ConfigNotifier
    | PersistRequire
    | TurnContextConsumer
    | TurnContextAppender
    | ToolApprover;

export type AgentModule = Record<string, unknown>;

export function defineAgentModule<T extends AgentModule>(module: T): T {
    return module;
}

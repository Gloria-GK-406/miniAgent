import type { Message, AssistMessage, ToolCallMessage, ToolResultMessage, FinishMessage } from "./types.js";
import type { Tool } from "../tool/types.js";

export interface AgentEventMap {
    "run:start": (payload: { input: Message }) => void;
    "run:complete": (payload: { messages: Message[] }) => void;
    "run:error": (payload: { error: unknown; turn: number }) => void;
    "turn:start": (payload: { turn: number }) => void;
    "turn:end": (payload: { turn: number }) => void;
    "llm:request": (payload: { context: Message[]; tools: Tool[] }) => void;
    "llm:response": (payload: { response: AssistMessage | ToolCallMessage[] }) => void;
    "tool:execute": (payload: { toolCall: ToolCallMessage }) => void;
    "tool:result": (payload: { toolCall: ToolCallMessage; result: ToolResultMessage | FinishMessage }) => void;
    "message:notify": (payload: { message: Message }) => void;
}

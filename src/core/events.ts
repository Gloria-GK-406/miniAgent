import { z } from "zod";
import { createFunctionSchema } from "./function-schema.js";
import type {
    Message,
    ToolCallMessage,
    ToolResultMessage,
    LLMResponse,
    LLMStreamChunk,
} from "./types.js";
import type { Tool } from "./tool.js";

export const AgentEventMapSchema = z.object({
    "run:start": createFunctionSchema<(payload: { input: Message }) => void>(),
    "run:complete": createFunctionSchema<(payload: { messages: Message[] }) => void>(),
    "run:stop": createFunctionSchema<(payload: undefined) => void>(),
    "run:error": createFunctionSchema<(payload: { error: unknown; turn: number }) => void>(),
    "turn:start": createFunctionSchema<(payload: { turn: number }) => void>(),
    "turn:end": createFunctionSchema<(payload: { turn: number }) => void>(),
    "llm:request": createFunctionSchema<(payload: { context: Message[]; tools: Tool[] }) => void>(),
    "llm:chunk": createFunctionSchema<(payload: { chunk: LLMStreamChunk }) => void>(),
    "llm:response": createFunctionSchema<(payload: { response: LLMResponse }) => void>(),
    "tool:execute": createFunctionSchema<(payload: { toolCall: ToolCallMessage }) => void>(),
    "tool:result": createFunctionSchema<(
        payload: { toolCall: ToolCallMessage; result: ToolResultMessage },
    ) => void>(),
    "message:notify": createFunctionSchema<(payload: { message: Message }) => void>(),
});

export type AgentEventMap = z.infer<typeof AgentEventMapSchema>;

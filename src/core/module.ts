import { z } from "zod";
import {
    AfterTurnProcessorSchema,
    ContextProcessorSchema,
    ContextProviderSchema,
    DestroyableSchema,
    ErrorHandlerSchema,
    LLMRequireSchema,
    MessageNotifierSchema,
    TurnContextAppenderSchema,
    TurnContextConsumerSchema,
} from "./types.js";
import { PersistRequireSchema } from "./persistence.js";
import { OneShotLLMRequireSchema } from "./one-shot-llm.js";
import { ToolApproverSchema, ToolProviderSchema, ToolSchema } from "./tool.js";

export const AgentRegistrableSchema = z.union([
    ToolSchema,
    ToolProviderSchema,
    ContextProviderSchema,
    ContextProcessorSchema,
    MessageNotifierSchema,
    ErrorHandlerSchema,
    AfterTurnProcessorSchema,
    PersistRequireSchema,
    TurnContextConsumerSchema,
    TurnContextAppenderSchema,
    ToolApproverSchema,
    LLMRequireSchema,
    OneShotLLMRequireSchema,
    DestroyableSchema,
]);

export type AgentRegistrable = z.infer<typeof AgentRegistrableSchema>;

export const AgentModuleSchema = z.record(z.string(), z.unknown());

export type AgentModule = z.infer<typeof AgentModuleSchema>;

export function defineAgentModule<T extends AgentModule>(module: T): T {
    return module;
}

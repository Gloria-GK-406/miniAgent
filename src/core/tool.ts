import { z } from "zod";
import { createFunctionSchema } from "./function-schema.js";
import { createProtocolSchema } from "./protocol-schema.js";

export const ToolSchema = createProtocolSchema({
    name: z.string(),
    description: z.string(),
    parameters: z.instanceof(z.ZodType),
    execute: createFunctionSchema<(
        args: Record<string, unknown>,
        signal?: AbortSignal,
    ) => Promise<string>>(),
});

export type Tool = z.infer<typeof ToolSchema>;

export const ToolProviderSchema = createProtocolSchema({
    getTools: createFunctionSchema<() => Promise<Tool[]>>(),
});

export type ToolProvider = z.infer<typeof ToolProviderSchema>;

export const ToolApproverSchema = createProtocolSchema({
    requestApproval: createFunctionSchema<(
        toolName: string,
        args: Record<string, unknown>,
    ) => Promise<boolean>>(),
});

export type ToolApprover = z.infer<typeof ToolApproverSchema>;

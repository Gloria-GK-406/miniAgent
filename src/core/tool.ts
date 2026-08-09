import { z } from "zod";

export const ToolSchema = z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.instanceof(z.ZodType),
    execute: z.function(
        z.tuple([z.record(z.unknown()), z.instanceof(AbortSignal).optional()]),
        z.promise(z.string()),
    ),
});

export type Tool = z.infer<typeof ToolSchema>;

export const ToolProviderSchema = z.object({
    getTools: z.function(
        z.tuple([]),
        z.promise(z.array(ToolSchema)),
    ),
});

export type ToolProvider = z.infer<typeof ToolProviderSchema>;

export const ToolApproverSchema = z.object({
    requestApproval: z.function(
        z.tuple([z.string(), z.record(z.unknown())]),
        z.promise(z.boolean()),
    ),
});

export type ToolApprover = z.infer<typeof ToolApproverSchema>;

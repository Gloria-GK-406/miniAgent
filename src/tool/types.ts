import { z } from "zod";

export const ToolSchema = z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.instanceof(z.ZodType),
    execute: z.function(
        z.tuple([z.record(z.unknown())]),
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

export const ToolProviderRegisterSchema = z.object({
    register: z.function(
        z.tuple([ToolProviderSchema]),
        z.void(),
    ),
});

export type ToolProviderRegister = z.infer<typeof ToolProviderRegisterSchema>;

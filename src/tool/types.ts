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

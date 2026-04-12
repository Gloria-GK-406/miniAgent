import { z } from "zod";

export const ToolApproverSchema = z.object({
    requestApproval: z.function(
        z.tuple([z.string(), z.record(z.unknown())]),
        z.promise(z.boolean()),
    ),
});

export type ToolApprover = z.infer<typeof ToolApproverSchema>;

import { z } from "zod";

export type ApprovalDecision = "approve" | "deny" | "approve_all";

export const ToolApproverSchema = z.object({
    requestApproval: z.function(
        z.tuple([z.string(), z.record(z.unknown())]),
        z.promise(z.custom<ApprovalDecision>()),
    ),
});

export type ToolApprover = z.infer<typeof ToolApproverSchema>;

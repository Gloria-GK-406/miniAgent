import { z } from "zod";

export const AgentBlueprintSchema = z.object({
    uses: z.array(z.string()).default([]),
});

export type AgentBlueprint = z.infer<typeof AgentBlueprintSchema>;

import { z } from "zod";
import { JsonValueSchema } from "../../core/index.js";

export const BlueprintUseSchema = z.strictObject({
    use: z.string().min(1),
    config: JsonValueSchema.optional(),
});

export type BlueprintUse = z.infer<typeof BlueprintUseSchema>;

export const AgentBlueprintSchema = z.strictObject({
    engines: z.array(BlueprintUseSchema).optional(),
    tools: z.array(BlueprintUseSchema).optional(),
    compression: BlueprintUseSchema.optional(),
    persistence: BlueprintUseSchema.optional(),
    mcp: BlueprintUseSchema.optional(),
    skill: BlueprintUseSchema.optional(),
    subagent: BlueprintUseSchema.optional(),
    approval: BlueprintUseSchema.optional(),
    context: z.array(BlueprintUseSchema).optional(),
    custom: z.record(
        z.string(),
        z.union([BlueprintUseSchema, z.array(BlueprintUseSchema)]),
    ).optional(),
});

export type AgentBlueprint = z.infer<typeof AgentBlueprintSchema>;

import { z } from "zod";
import { JsonValueSchema } from "../../core/index.js";

export const BlueprintUseSchema = z.object({
    use: z.string().min(1),
    config: JsonValueSchema.optional(),
}).strict();

export type BlueprintUse = z.infer<typeof BlueprintUseSchema>;

export const AgentBlueprintSchema = z.object({
    engines: z.array(BlueprintUseSchema).optional(),
    tools: z.array(BlueprintUseSchema).optional(),
    compression: BlueprintUseSchema.optional(),
    persistence: BlueprintUseSchema.optional(),
    mcp: BlueprintUseSchema.optional(),
    skill: BlueprintUseSchema.optional(),
    subagent: BlueprintUseSchema.optional(),
    approval: BlueprintUseSchema.optional(),
    context: z.array(BlueprintUseSchema).optional(),
    custom: z.record(z.union([BlueprintUseSchema, z.array(BlueprintUseSchema)])).optional(),
}).strict();

export type AgentBlueprint = z.infer<typeof AgentBlueprintSchema>;

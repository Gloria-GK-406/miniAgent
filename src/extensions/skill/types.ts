import { z } from "zod";
import { AgentCapabilityRuleSchema } from "../../core/index.js";

export const SkillCapabilitySelectorSchema = AgentCapabilityRuleSchema;

export type SkillCapabilitySelector = z.infer<typeof SkillCapabilitySelectorSchema>;

export const SkillPluginConfigSchema = z.object({
    directories: z.array(z.string()).default(["skill/"]),
    capabilities: SkillCapabilitySelectorSchema.optional(),
});

export type SkillPluginConfig = z.infer<typeof SkillPluginConfigSchema>;
export type SkillPluginConfigInput = z.input<typeof SkillPluginConfigSchema>;

export const SkillEntrySchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    content: z.string(),
    dirPath: z.string(),
    files: z.array(z.string()),
});

export type SkillEntry = z.infer<typeof SkillEntrySchema>;

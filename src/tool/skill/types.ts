import { z } from "zod";
import { AgentCapabilityRuleSchema } from "../../assembly/capability.js";

export const SkillCapabilitySelectorSchema = AgentCapabilityRuleSchema;

export type SkillCapabilitySelector = z.infer<typeof SkillCapabilitySelectorSchema>;

export const SkillPluginConfigSchema = z.object({
    directories: z.array(z.string()).default(["skill/"]),
    capabilities: SkillCapabilitySelectorSchema.optional(),
});

export type SkillPluginConfig = z.infer<typeof SkillPluginConfigSchema>;
export type SkillPluginConfigInput = z.input<typeof SkillPluginConfigSchema>;

export interface SkillEntry {
    id: string;
    name: string;
    description: string;
    content: string;
    dirPath: string;
    files: string[];
}

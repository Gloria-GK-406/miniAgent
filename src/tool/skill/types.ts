import { z } from "zod";
import { AgentCapabilityRuleSchema } from "../../core/capability.js";

export const SkillPluginConfigSchema = z.object({
    directories: z.array(z.string()).default(["skill/"]),
});

export type SkillPluginConfig = z.infer<typeof SkillPluginConfigSchema>;

export const SkillCapabilitySelectorSchema = AgentCapabilityRuleSchema;

export type SkillCapabilitySelector = z.infer<typeof SkillCapabilitySelectorSchema>;

export interface SkillEntry {
    id: string;
    name: string;
    description: string;
    content: string;
    dirPath: string;
    files: string[];
}

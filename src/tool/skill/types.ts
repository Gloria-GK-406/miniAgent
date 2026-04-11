import { z } from "zod";

export const SkillPluginConfigSchema = z.object({
    directories: z.array(z.string()).default(["skill/"]),
});

export type SkillPluginConfig = z.infer<typeof SkillPluginConfigSchema>;

export interface SkillEntry {
    id: string;
    name: string;
    description: string;
    content: string;
    dirPath: string;
    files: string[];
}

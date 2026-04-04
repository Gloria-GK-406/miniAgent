import { z } from "zod";

export const ModelConfigSchema = z.object({
    provider: z.string(),
    model: z.string(),
    apiKey: z.string(),
    baseUrl: z.string(),
    thinking: z.boolean().optional(),
    maxTokens: z.number().int().positive().optional(),
    contextSize: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const PathConfigSchema = z.object({
    basedir: z.string(),
    basepersistdir: z.string(),
});

export type PathConfig = z.infer<typeof PathConfigSchema>;

export const AgentConfigSchema = z.object({
    model: ModelConfigSchema,
    paths: PathConfigSchema,
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

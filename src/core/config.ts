import { z } from "zod";

export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

const JsonPrimitiveSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
]);

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([
        JsonPrimitiveSchema,
        z.array(JsonValueSchema),
        z.record(JsonValueSchema),
    ]),
);

export const ModelConfigSchema = z.object({
    provider: z.string(),
    model: z.string(),
    apiKey: z.string(),
    baseUrl: z.string().optional(),
    thinking: z.boolean().optional(),
    maxTokens: z.number().int().positive().optional(),
    contextSize: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const ModelGroupSchema = z.object({
    models: z.array(ModelConfigSchema).min(1),
});

export type ModelGroup = z.infer<typeof ModelGroupSchema>;

export const PathConfigSchema = z.object({
    sessiondir: z.string(),
});

export type PathConfig = z.infer<typeof PathConfigSchema>;

export const PersistConfigFileSchema = z.object({
    defaultModel: z.string().optional(),
    models: z.record(ModelGroupSchema).default({}),
    plugins: z.record(JsonValueSchema).default({}),
});

export const PersistConfigSchema = PersistConfigFileSchema;

export type PersistConfigFile = z.infer<typeof PersistConfigFileSchema>;
export type PersistConfig = z.infer<typeof PersistConfigSchema>;

export const RuntimeConfigSchema = z.object({
    activeModel: z.string().optional(),
    paths: PathConfigSchema,
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export const AgentConfigSchema = z.object({
    model: ModelConfigSchema,
    models: z.map(z.string(), ModelGroupSchema),
    plugins: z.map(z.string(), JsonValueSchema),
    paths: PathConfigSchema,
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

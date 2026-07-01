import { z } from "zod";
import type { Tool } from "../tool/types.js";
import type { Message } from "./types.js";

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

export enum ThinkingLevel {
    None = "none",
    Low = "low",
    Medium = "medium",
    High = "high",
    Max = "max",
}

export const ThinkingLevelSchema = z.nativeEnum(ThinkingLevel);

export const ModelPresetSchema = z.object({
    model: z.string(),
    displayName: z.string().optional(),
    contextSize: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    thinkingLevels: z.array(ThinkingLevelSchema).min(1).default([ThinkingLevel.None]),
});

export type ModelPreset = z.infer<typeof ModelPresetSchema>;

export const ProviderModelOverridesSchema = z.object({
    add: z.array(ModelPresetSchema).optional(),
    override: z.record(ModelPresetSchema.partial().omit({ model: true })).optional(),
});

export type ProviderModelOverrides = z.infer<typeof ProviderModelOverridesSchema>;

export const ModelProviderConfigSchema = z.object({
    name: z.string(),
    engine: z.string(),
    apiKey: z.string(),
    baseUrl: z.string().optional(),
    models: ProviderModelOverridesSchema.optional(),
});

export type ModelProviderConfig = z.infer<typeof ModelProviderConfigSchema>;

export const ResolvedModelSchema = z
    .object({
        id: z.string(),
        provider: z.string(),
        engine: z.string(),
        model: z.string(),
        displayName: z.string().optional(),
        contextSize: z.number().int().positive().optional(),
        maxOutputTokens: z.number().int().positive().optional(),
        thinkingLevels: z.array(ThinkingLevelSchema).min(1),
    })
    .strict();

export type ResolvedModel = z.infer<typeof ResolvedModelSchema>;

export const ModelSelectorSchema = z.union([
    z.object({ id: z.string() }),
    z.object({ provider: z.string(), model: z.string() }),
]);

export type ModelSelector = z.infer<typeof ModelSelectorSchema>;

export const GenerationConfigSchema = z.object({
    temperature: z.number().min(0).max(2).default(0.7),
    topP: z.number().min(0).max(1).optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    thinking: ThinkingLevelSchema.default(ThinkingLevel.Medium),
});

export type GenerationConfig = z.infer<typeof GenerationConfigSchema>;
export type GenerationConfigInput = Partial<z.input<typeof GenerationConfigSchema>>;

export function normalizeGenerationConfig(
    input?: GenerationConfigInput,
): GenerationConfig {
    return GenerationConfigSchema.parse(input ?? {});
}

export const LLMGenerateRequestSchema = z.object({
    messages: z.array(z.custom<Message>()),
    tools: z.array(z.custom<Tool>()),
    provider: ModelProviderConfigSchema,
    model: ResolvedModelSchema,
    generation: GenerationConfigSchema,
});

export type LLMGenerateRequest = {
    messages: Message[];
    tools: Tool[];
    provider: ModelProviderConfig;
    model: ResolvedModel;
    generation: GenerationConfig;
};

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
    model: ModelConfigSchema.optional(),
    models: z.map(z.string(), ModelGroupSchema).default(() => new Map()),
    providers: z.array(ModelProviderConfigSchema).optional(),
    defaultModel: ModelSelectorSchema.optional(),
    generation: GenerationConfigSchema.partial().optional(),
    plugins: z.map(z.string(), JsonValueSchema),
    paths: PathConfigSchema,
});

export type AgentConfig = z.input<typeof AgentConfigSchema>;
export type NormalizedAgentConfig = z.output<typeof AgentConfigSchema>;

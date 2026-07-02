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

export enum ThinkingLevel {
    None = "none",
    Low = "low",
    Medium = "medium",
    High = "high",
    Max = "max",
}

export const ThinkingLevelSchema = z.nativeEnum(ThinkingLevel);

export const ModelPresetSchema = z
    .object({
        id: z.string().min(1),
        name: z.string().min(1),
        displayName: z.string().optional(),
        contextSize: z.number().int().positive().optional(),
        maxOutputTokens: z.number().int().positive().optional(),
        thinkingLevels: z.array(ThinkingLevelSchema).min(1).optional(),
        capabilities: z.record(JsonValueSchema).optional(),
        metadata: z.record(JsonValueSchema).optional(),
    })
    .strict();

export type ModelPreset = z.infer<typeof ModelPresetSchema>;

export const ProviderModelOverridesSchema = z
    .object({
        add: z.array(ModelPresetSchema).optional(),
        override: z.record(ModelPresetSchema.partial().omit({ id: true, name: true })).optional(),
    })
    .strict();

export type ProviderModelOverrides = z.infer<typeof ProviderModelOverridesSchema>;

export const ModelProviderConfigSchema = z
    .object({
        provider: z.string().min(1),
        key: z.string().min(1),
        baseUrl: z.string().optional(),
        models: z.array(ModelPresetSchema).default([]),
    })
    .strict();

export type ModelProviderConfig = z.input<typeof ModelProviderConfigSchema>;

export const ResolvedModelSchema = z
    .object({
        id: z.string().min(1),
        provider: z.string().min(1),
        name: z.string().min(1),
        displayName: z.string().optional(),
        contextSize: z.number().int().positive().optional(),
        maxOutputTokens: z.number().int().positive().optional(),
        thinkingLevels: z.array(ThinkingLevelSchema).min(1),
        capabilities: z.record(JsonValueSchema).optional(),
        metadata: z.record(JsonValueSchema).optional(),
    })
    .strict();

export type ResolvedModel = z.infer<typeof ResolvedModelSchema>;

export const ModelSelectorSchema = z.union([
    z.object({
        id: z.string().min(1),
        provider: z.string().min(1).optional(),
    }).strict(),
    z.object({ provider: z.string().min(1), model: z.string().min(1) }).strict(),
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

export const PathConfigSchema = z.object({
    sessiondir: z.string(),
});

export type PathConfig = z.infer<typeof PathConfigSchema>;

const PersistModelSelectorSchema = z.union([
    z.string().min(1).transform((id) => ({ id })),
    ModelSelectorSchema,
]);

export const PersistConfigFileSchema = z
    .object({
        providers: z.array(ModelProviderConfigSchema).default([]),
        defaultModel: PersistModelSelectorSchema.optional(),
        generation: GenerationConfigSchema.partial().optional(),
    })
    .strict();

export const PersistConfigSchema = PersistConfigFileSchema;

export type PersistConfigFile = z.infer<typeof PersistConfigFileSchema>;
export type PersistConfig = z.infer<typeof PersistConfigSchema>;

const RuntimeModelSelectorSchema = z.union([
    z.string().min(1).transform((id) => ({ id })),
    ModelSelectorSchema,
]);

export const RuntimeConfigSchema = z
    .object({
        activeModel: RuntimeModelSelectorSchema.optional(),
        paths: PathConfigSchema,
    })
    .strict();

export type RuntimeConfig = z.input<typeof RuntimeConfigSchema>;
export type NormalizedRuntimeConfig = z.output<typeof RuntimeConfigSchema>;

export const AgentConfigSchema = z
    .object({
        providers: z.array(ModelProviderConfigSchema).default([]),
        defaultModel: ModelSelectorSchema.optional(),
        generation: GenerationConfigSchema.optional(),
        paths: PathConfigSchema,
    })
    .strict();

export type AgentConfig = z.input<typeof AgentConfigSchema>;
export type NormalizedAgentConfig = z.output<typeof AgentConfigSchema>;

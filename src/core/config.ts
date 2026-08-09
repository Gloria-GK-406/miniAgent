import { z } from "zod";
import type { Tool } from "./tool.js";
import type { Message } from "./message.js";

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

export const ModelSchema = ModelPresetSchema
    .omit({ id: true })
    .extend({
        thinkingLevels: z.array(ThinkingLevelSchema).min(1).default([ThinkingLevel.None]),
    })
    .strict();

export type Model = z.infer<typeof ModelSchema>;

export const ModelRuntimeSchema = z
    .object({
        provider: z.string().min(1),
        key: z.string().min(1),
        baseUrl: z.string().optional(),
        model: ModelSchema,
    })
    .strict();

export type ModelRuntime = z.infer<typeof ModelRuntimeSchema>;

export const PublicModelRuntimeSchema = ModelRuntimeSchema.omit({ key: true });

export type PublicModelRuntime = z.infer<typeof PublicModelRuntimeSchema>;

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
    runtime: ModelRuntimeSchema,
    generation: GenerationConfigSchema,
});

export type LLMGenerateRequest = z.infer<typeof LLMGenerateRequestSchema>;

export const PathConfigSchema = z.object({
    sessiondir: z.string(),
});

export type PathConfig = z.infer<typeof PathConfigSchema>;

export const AgentConfigSchema = z
    .object({
        generation: GenerationConfigSchema.optional(),
        paths: PathConfigSchema,
    })
    .strict();

export type AgentConfig = z.input<typeof AgentConfigSchema>;
export type NormalizedAgentConfig = z.output<typeof AgentConfigSchema>;

import { describe, expect, it } from "vitest";
import {
    GenerationConfigSchema,
    LLMGenerateRequestSchema,
    ModelAwareLLMRequestSchema,
    ModelPresetSchema,
    ModelProviderConfigSchema,
    ModelSelectorSchema,
    ProviderModelOverridesSchema,
    ResolvedModelSchema,
    ThinkingLevel,
    ThinkingLevelSchema,
    normalizeGenerationConfig,
    type GenerationConfig,
    type GenerationConfigInput,
    type LLMGenerateRequest,
    type ModelAwareLLMRequest,
    type ModelPreset,
    type ModelProviderConfig,
    type ModelSelector,
    type ProviderModelOverrides,
    type ResolvedModel,
} from "./index.js";

describe("root exports", () => {
    it("exports model preset and generate request public API", () => {
        const preset: ModelPreset = ModelPresetSchema.parse({
            model: "test-model",
            thinkingLevels: [ThinkingLevel.None],
        });
        const overrides: ProviderModelOverrides = ProviderModelOverridesSchema.parse({
            add: [preset],
        });
        const provider: ModelProviderConfig = ModelProviderConfigSchema.parse({
            name: "test-provider",
            engine: "test-engine",
            apiKey: "key",
            models: overrides,
        });
        const resolvedModel: ResolvedModel = ResolvedModelSchema.parse({
            id: "test-provider/test-model",
            provider: "test-provider",
            engine: "test-engine",
            model: "test-model",
            thinkingLevels: [ThinkingLevel.None],
        });
        const selector: ModelSelector = ModelSelectorSchema.parse({
            id: "test-provider/test-model",
        });
        const generationInput: GenerationConfigInput = {
            thinking: ThinkingLevel.Medium,
        };
        const generation: GenerationConfig = normalizeGenerationConfig(generationInput);
        const request: LLMGenerateRequest = LLMGenerateRequestSchema.parse({
            messages: [],
            tools: [],
            provider,
            model: resolvedModel,
            generation,
        });
        const requestInvoker: ModelAwareLLMRequest = ModelAwareLLMRequestSchema.parse({
            getEngineModels: () => [preset],
            streamInvoke: () => {
                throw new Error("not used");
            },
        });

        expect(ThinkingLevelSchema.parse("none")).toBe(ThinkingLevel.None);
        expect(GenerationConfigSchema.parse({}).temperature).toBe(0.7);
        expect(selector).toEqual({ id: "test-provider/test-model" });
        expect(request.model.model).toBe("test-model");
        expect(requestInvoker.getEngineModels("test-engine")).toEqual([preset]);
    });
});

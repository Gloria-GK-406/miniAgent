import { describe, expect, it } from "vitest";
import * as publicApi from "./index.js";
import {
    GenerationConfigSchema,
    LLMGenerateRequestSchema,
    LLMRequestSchema,
    LLMStreamChunkType,
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
    type LLMRequest,
    type ModelPreset,
    type ModelProviderConfig,
    type ModelSelector,
    type ProviderModelOverrides,
    type ResolvedModel,
} from "./index.js";

describe("root exports", () => {
    it("exports model preset and generate request public API", () => {
        const preset: ModelPreset = ModelPresetSchema.parse({
            id: "test-model",
            name: "public-model-name",
            thinkingLevels: [ThinkingLevel.None],
        });
        const overrides: ProviderModelOverrides = ProviderModelOverridesSchema.parse({
            add: [preset],
        });
        const provider: ModelProviderConfig = ModelProviderConfigSchema.parse({
            provider: "test-provider",
            key: "key",
            models: [preset],
        });
        const resolvedModel: ResolvedModel = ResolvedModelSchema.parse({
            id: "test-model",
            provider: "test-provider",
            name: "public-model-name",
            thinkingLevels: [ThinkingLevel.None],
        });
        const selector: ModelSelector = ModelSelectorSchema.parse({
            id: "test-model",
            provider: "test-provider",
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
        const requestInvoker: LLMRequest = LLMRequestSchema.parse({
            getEngineModels: () => [resolvedModel],
            streamInvoke: async function* () {
                yield { type: LLMStreamChunkType.TextDelta, text: "not used" };
            },
        });

        expect(ThinkingLevelSchema.parse("none")).toBe(ThinkingLevel.None);
        expect(GenerationConfigSchema.parse({}).temperature).toBe(0.7);
        expect(overrides.add).toEqual([preset]);
        expect(selector).toEqual({ id: "test-model", provider: "test-provider" });
        expect(request.model.name).toBe("public-model-name");
        expect(requestInvoker.getEngineModels("test-provider")).toEqual([resolvedModel]);
    });

    it("does not export retired model config runtime schemas", () => {
        const retiredExports = [
            "Model" + "ConfigSchema",
            "Model" + "GroupSchema",
            "Model" + "AwareLLMRequestSchema",
        ];

        for (const name of retiredExports) {
            expect(publicApi).not.toHaveProperty(name);
        }
    });
});

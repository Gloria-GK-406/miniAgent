import { describe, expect, it } from "vitest";
import * as publicApi from "./index.js";
import {
    GenerationConfigSchema,
    LLMGenerateRequestSchema,
    LLMRequestSchema,
    LLMStreamChunkType,
    ModelPresetSchema,
    ModelRuntimeSchema,
    PublicModelRuntimeSchema,
    ThinkingLevel,
    ThinkingLevelSchema,
    normalizeGenerationConfig,
    type GenerationConfig,
    type GenerationConfigInput,
    type LLMGenerateRequest,
    type LLMRequest,
    type ModelPreset,
    type ModelRuntime,
} from "./index.js";

describe("root exports", () => {
    it("exports model preset and generate request public API", () => {
        const preset: ModelPreset = ModelPresetSchema.parse({
            id: "test-model",
            name: "public-model-name",
            thinkingLevels: [ThinkingLevel.None],
        });
        const runtime: ModelRuntime = ModelRuntimeSchema.parse({
            provider: "test-provider",
            key: "key",
            model: {
                name: preset.name,
                thinkingLevels: preset.thinkingLevels,
            },
        });
        const generationInput: GenerationConfigInput = {
            thinking: ThinkingLevel.Medium,
        };
        const generation: GenerationConfig = normalizeGenerationConfig(generationInput);
        const request: LLMGenerateRequest = LLMGenerateRequestSchema.parse({
            messages: [],
            tools: [],
            runtime,
            generation,
        });
        const requestInvoker: LLMRequest = LLMRequestSchema.parse({
            streamInvoke: async function* () {
                yield { type: LLMStreamChunkType.TextDelta, text: "not used" };
            },
        });

        expect(ThinkingLevelSchema.parse("none")).toBe(ThinkingLevel.None);
        expect(GenerationConfigSchema.parse({}).temperature).toBe(0.7);
        expect(PublicModelRuntimeSchema.parse({
            provider: runtime.provider,
            model: runtime.model,
        }).model.name).toBe("public-model-name");
        expect(request.runtime.model.name).toBe("public-model-name");
        expect(requestInvoker.streamInvoke).toBeTypeOf("function");
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

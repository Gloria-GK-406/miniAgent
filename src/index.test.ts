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
    TokenUsageCounter,
    TokenUsageServiceSchema,
    OneShotLLMRequireSchema,
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
            "Agent" + "RuntimeAccessSchema",
            "Agent" + "RuntimeRequireSchema",
        ];

        for (const name of retiredExports) {
            expect(publicApi).not.toHaveProperty(name);
        }
    });

    it("exports one-shot injection and aggregate token usage contracts", () => {
        const usage = new TokenUsageCounter();

        expect(TokenUsageServiceSchema.safeParse(usage).success).toBe(true);
        expect(usage.getTokenUsage()).toEqual({ input: 0, output: 0, total: 0 });
        expect(OneShotLLMRequireSchema.safeParse({
            setOneShotLLMFactory: (): void => {},
        }).success).toBe(true);
    });
});

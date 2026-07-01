import { describe, expect, it } from "vitest";
import {
  type AgentConfig,
  AgentConfigSchema,
  GenerationConfigSchema,
  normalizeGenerationConfig,
  ModelProviderConfigSchema,
  ResolvedModelSchema,
  ThinkingLevel,
} from "./config.js";

describe("model provider config", () => {
  it("accepts provider credentials with model additions", () => {
    const parsed = ModelProviderConfigSchema.parse({
      name: "local-qwen",
      engine: "openai-compatible",
      apiKey: "key",
      baseUrl: "http://localhost:8000/v1",
      models: {
        add: [
          {
            model: "qwen3-coder",
            contextSize: 128000,
            maxOutputTokens: 32768,
            thinkingLevels: ["none", "medium"],
          },
        ],
      },
    });

    expect(parsed.name).toBe("local-qwen");
    expect(parsed.models?.add?.[0]?.thinkingLevels).toEqual([
      ThinkingLevel.None,
      ThinkingLevel.Medium,
    ]);
  });

  it("normalizes missing generation config to MiniAgent defaults", () => {
    expect(normalizeGenerationConfig(undefined)).toEqual({
      temperature: 0.7,
      thinking: ThinkingLevel.Medium,
    });
  });

  it("keeps resolved models free of generation defaults", () => {
    const result = ResolvedModelSchema.safeParse({
      id: "glm-main/glm-5.2",
      provider: "glm-main",
      engine: "glm",
      model: "glm-5.2",
      contextSize: 128000,
      maxOutputTokens: 8192,
      thinkingLevels: ["none", "low", "medium", "high", "max"],
      temperature: 0.2,
    });

    expect(result.success).toBe(false);
  });

  it("accepts partial generation config updates", () => {
    const parsed = GenerationConfigSchema.partial().parse({
      thinking: "none",
    });

    expect(parsed.thinking).toBe(ThinkingLevel.None);
  });

  it("types and parses provider-only agent config", () => {
    const typed: AgentConfig = {
      providers: [
        {
          name: "local",
          engine: "openai-compatible",
          apiKey: "key",
          models: { add: [{ model: "qwen", thinkingLevels: [ThinkingLevel.None] }] },
        },
      ],
      defaultModel: { id: "local/qwen" },
      generation: { thinking: ThinkingLevel.Medium },
      plugins: new Map(),
      paths: { sessiondir: "/tmp/session" },
    };

    const parsed = AgentConfigSchema.parse(typed);
    expect(parsed.model).toBeUndefined();
    expect(parsed.models).toBeInstanceOf(Map);
    expect(parsed.providers?.[0]?.name).toBe("local");
  });
});

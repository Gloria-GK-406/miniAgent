import { describe, expect, it } from "vitest";
import {
  AgentConfigSchema,
  GenerationConfigSchema,
  normalizeGenerationConfig,
  ModelProviderConfigSchema,
  PersistConfigSchema,
  ResolvedModelSchema,
  ThinkingLevel,
} from "./config.js";

describe("model provider config", () => {
  it("accepts provider credentials with model additions", () => {
    const parsed = ModelProviderConfigSchema.parse({
      provider: "local-qwen",
      key: "key",
      baseUrl: "http://localhost:8000/v1",
      models: [
        {
          id: "qwen",
          name: "qwen3-coder",
          contextSize: 128000,
          maxOutputTokens: 32768,
          thinkingLevels: ["none", "medium"],
        },
      ],
    });

    expect(parsed.provider).toBe("local-qwen");
    expect(parsed.models?.[0]?.thinkingLevels).toEqual([
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
      name: "glm-5.2",
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

  it("accepts provider-qualified model id selectors", () => {
    const parsed = AgentConfigSchema.parse({
      providers: [
        {
          provider: "openai",
          key: "test-key",
          models: [{ id: "fast", name: "gpt-4o-mini" }],
        },
      ],
      defaultModel: { id: "fast", provider: "openai" },
      plugins: new Map(),
      paths: { sessiondir: "/tmp/session" },
    });

    expect(parsed.defaultModel).toEqual({ id: "fast", provider: "openai" });
  });

  it("types and parses provider-only agent config", () => {
    const typed = {
      providers: [
        {
          provider: "local",
          key: "key",
          models: [{ id: "qwen", name: "qwen", thinkingLevels: [ThinkingLevel.None] }],
        },
      ],
      defaultModel: { id: "qwen" },
      generation: { temperature: 0.7, thinking: ThinkingLevel.Medium },
      plugins: new Map(),
      paths: { sessiondir: "/tmp/session" },
    };

    const parsed = AgentConfigSchema.parse(typed);
    expect(parsed.providers[0]?.provider).toBe("local");
  });
});

describe("provider-only config schemas", () => {
  it("rejects legacy agent model fields", () => {
    const result = AgentConfigSchema.safeParse({
      model: { provider: "openai", model: "gpt-4o" },
      models: new Map(),
      providers: [],
      plugins: new Map(),
      paths: { sessiondir: "/tmp/session" },
    });

    expect(result.success).toBe(false);
  });

  it("parses provider-mode agent config", () => {
    const result = AgentConfigSchema.safeParse({
      providers: [
        {
          provider: "openai",
          key: "test-key",
          models: [{ id: "fast", name: "gpt-4o-mini" }],
        },
      ],
      defaultModel: { id: "fast" },
      generation: {
        temperature: 0.7,
        thinking: ThinkingLevel.Medium,
      },
      plugins: new Map(),
      paths: { sessiondir: "/tmp/session" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects legacy persisted models", () => {
    const result = PersistConfigSchema.safeParse({
      models: {
        openai: {
          type: "openai",
          apiKey: "test-key",
          model: "gpt-4o",
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("parses provider-mode persisted config", () => {
    const result = PersistConfigSchema.safeParse({
      providers: [
        {
          provider: "openai",
          key: "test-key",
          models: [{ id: "fast", name: "gpt-4o-mini" }],
        },
      ],
      defaultModel: "fast",
      generation: {
        temperature: 0.2,
        thinking: "high",
      },
    });

    expect(result.success).toBe(true);
    expect(result.data.defaultModel).toEqual({ id: "fast" });
  });
});

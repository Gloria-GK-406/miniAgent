import { describe, expect, it } from "vitest";
import {
  AgentConfigSchema,
  GenerationConfigInputSchema,
  ModelRuntimeSchema,
  PublicModelRuntimeSchema,
  ThinkingLevel,
  normalizeGenerationConfig,
} from "./config.js";

describe("model runtime", () => {
  it("parses one complete model runtime without a model catalog", () => {
    const runtime = ModelRuntimeSchema.parse({
      provider: "openai-compatible",
      key: "secret",
      baseUrl: "https://example.com/v1",
      model: {
        name: "example-model",
        thinkingLevels: ["none"],
      },
    });

    expect(runtime.model.thinkingLevels).toEqual([ThinkingLevel.None]);
  });

  it("defines a public runtime that cannot contain credentials", () => {
    expect(PublicModelRuntimeSchema.safeParse({
      provider: "openai",
      key: "secret",
      model: { name: "gpt", thinkingLevels: ["none"] },
    }).success).toBe(false);
  });
});

describe("agent config", () => {
  it("contains generation and paths only", () => {
    expect(AgentConfigSchema.parse({
      generation: { temperature: 0.2, thinking: "high" },
      paths: { sessiondir: "/tmp/session" },
    })).toEqual({
      generation: { temperature: 0.2, thinking: ThinkingLevel.High },
      paths: { sessiondir: "/tmp/session" },
    });
  });

  it("rejects provider catalogs", () => {
    expect(AgentConfigSchema.safeParse({
      providers: [],
      paths: { sessiondir: "/tmp/session" },
    }).success).toBe(false);
  });

  it("normalizes generation defaults and partial updates", () => {
    expect(normalizeGenerationConfig(undefined)).toEqual({
      temperature: 0.7,
      thinking: ThinkingLevel.Medium,
    });
    expect(GenerationConfigInputSchema.parse({ thinking: "none" }))
      .toEqual({ thinking: ThinkingLevel.None });
  });
});

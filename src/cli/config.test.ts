import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../core/config.js";
import {
  CLIConfigSchema,
  findLegacyModel,
  parseDefaultModel,
  toAgentGenerationConfig,
  toAgentProviders,
} from "./config.js";

describe("CLI config model providers", () => {
  it("parses provider engine model overrides and generation config", () => {
    const config = CLIConfigSchema.parse({
      providers: [
        {
          name: "anthropic-main",
          engine: "anthropic",
          apiKey: "sk-test",
          models: {
            add: [
              {
                model: "claude-custom",
                displayName: "Claude Custom",
                thinkingLevels: [ThinkingLevel.None, ThinkingLevel.High],
              },
            ],
          },
        },
      ],
      defaultModel: "anthropic-main/claude-custom",
      generation: {
        temperature: 0.2,
        thinking: ThinkingLevel.High,
      },
    });

    expect(config.models).toEqual([]);
    expect(config.generation).toEqual({
      temperature: 0.2,
      thinking: ThinkingLevel.High,
    });
    expect(parseDefaultModel(config)).toEqual({ id: "anthropic-main/claude-custom" });
    expect(toAgentProviders(config)).toEqual([
      {
        name: "anthropic-main",
        engine: "anthropic",
        apiKey: "sk-test",
        models: {
          add: [
            {
              model: "claude-custom",
              displayName: "Claude Custom",
              thinkingLevels: [ThinkingLevel.None, ThinkingLevel.High],
            },
          ],
        },
      },
    ]);
  });

  it("converts legacy providers and top-level models to provider model additions", () => {
    const config = CLIConfigSchema.parse({
      providers: [
        {
          name: "main",
          provider: "openai-compatible",
          apiKey: "legacy-key",
          baseUrl: "https://example.test/v1",
        },
      ],
      models: [
        {
          name: "fast",
          provider: "main",
          model: "custom-fast",
          maxOutputTokens: 4096,
        },
      ],
      defaultModel: "fast",
    });

    expect(parseDefaultModel(config)).toEqual({
      provider: "main",
      model: "custom-fast",
    });
    expect(toAgentProviders(config)).toEqual([
      {
        name: "main",
        engine: "openai-compatible",
        apiKey: "legacy-key",
        baseUrl: "https://example.test/v1",
        models: {
          add: [
            {
              model: "custom-fast",
              displayName: "fast",
              maxOutputTokens: 4096,
              thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
            },
          ],
        },
      },
    ]);
  });

  it("maps legacy maxTokens to request caps when maxOutputTokens is absent", () => {
    const config = CLIConfigSchema.parse({
      providers: [
        {
          name: "main",
          provider: "openai-compatible",
          apiKey: "legacy-key",
        },
      ],
      models: [
        {
          name: "fast",
          provider: "main",
          model: "custom-fast",
          maxTokens: 1234,
        },
      ],
      defaultModel: "fast",
    });

    expect(toAgentGenerationConfig(config)).toEqual({ maxOutputTokens: 1234 });
    expect(toAgentProviders(config)[0]?.models?.add?.[0]?.maxOutputTokens).toBe(1234);
  });

  it("prefers legacy maxOutputTokens over maxTokens", () => {
    const config = CLIConfigSchema.parse({
      providers: [
        {
          name: "main",
          provider: "openai-compatible",
          apiKey: "legacy-key",
        },
      ],
      models: [
        {
          name: "fast",
          provider: "main",
          model: "custom-fast",
          maxTokens: 1234,
          maxOutputTokens: 4096,
        },
      ],
      defaultModel: "fast",
    });

    expect(toAgentGenerationConfig(config)).toEqual({ maxOutputTokens: 4096 });
    expect(toAgentProviders(config)[0]?.models?.add?.[0]?.maxOutputTokens).toBe(4096);
  });

  it("finds legacy model generation by resolved id and engine alias", () => {
    const config = CLIConfigSchema.parse({
      providers: [
        {
          name: "main",
          provider: "openai-compatible",
          apiKey: "legacy-key",
        },
      ],
      models: [
        {
          name: "fast",
          provider: "main",
          model: "custom-fast",
          temperature: 0.25,
          thinking: false,
        },
      ],
      defaultModel: "fast",
    });

    expect(findLegacyModel(config, "main/custom-fast")?.name).toBe("fast");
    expect(findLegacyModel(config, "openai-compatible/custom-fast")?.name).toBe("fast");
    expect(toAgentGenerationConfig(config, "main/custom-fast")).toEqual({
      temperature: 0.25,
      thinking: ThinkingLevel.None,
    });
    expect(toAgentGenerationConfig(config, "openai-compatible/custom-fast")).toEqual({
      temperature: 0.25,
      thinking: ThinkingLevel.None,
    });
  });
});

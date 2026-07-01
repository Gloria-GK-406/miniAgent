import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../core/config.js";
import {
  CLIConfigSchema,
  parseDefaultModel,
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
});

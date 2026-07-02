import { describe, expect, it } from "vitest";
import {
  AgentConfigSchema,
  ThinkingLevel,
  type NormalizedAgentConfig,
  type ModelProviderConfig,
  type ResolvedModel,
} from "./config.js";
import {
  availableModelIds,
  cloneAgentConfig,
  cloneProviderConfig,
  cloneResolvedModel,
  selectorDescription,
  selectorFromResolvedModel,
  validateUniqueProviders,
} from "./model-config-utils.js";

describe("model-config-utils", () => {
  it("cloneProviderConfig deep clones provider model arrays and records", () => {
    const provider: ModelProviderConfig = {
      provider: "openai",
      key: "test-key",
      baseUrl: "https://example.test/v1",
      models: [
        {
          id: "fast",
          name: "gpt-4o-mini",
          thinkingLevels: [ThinkingLevel.None, ThinkingLevel.High],
          capabilities: {
            toolUse: true,
            nested: { values: ["a"] },
          },
          metadata: {
            tags: ["stable"],
            nested: { release: "2024-05" },
          },
        },
      ],
    };

    const cloned = cloneProviderConfig(provider);

    cloned.models![0]!.thinkingLevels!.push(ThinkingLevel.Max);
    cloned.models![0]!.capabilities!.nested = { values: ["b"] };
    cloned.models![0]!.metadata!.tags = ["mutated"];

    expect(provider.models![0]!.thinkingLevels).toEqual([
      ThinkingLevel.None,
      ThinkingLevel.High,
    ]);
    expect(provider.models![0]!.capabilities).toEqual({
      toolUse: true,
      nested: { values: ["a"] },
    });
    expect(provider.models![0]!.metadata).toEqual({
      tags: ["stable"],
      nested: { release: "2024-05" },
    });
  });

  it("cloneResolvedModel deep clones thinking levels and records", () => {
    const model: ResolvedModel = {
      id: "fast",
      provider: "openai",
      name: "gpt-4o-mini",
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
      capabilities: {
        toolUse: true,
        nested: { modes: ["json"] },
      },
      metadata: {
        families: ["gpt"],
        nested: { tier: "fast" },
      },
    };

    const cloned = cloneResolvedModel(model);

    cloned.thinkingLevels.push(ThinkingLevel.Max);
    cloned.capabilities!.nested = { modes: ["text"] };
    cloned.metadata!.families = ["mutated"];

    expect(model.thinkingLevels).toEqual([
      ThinkingLevel.None,
      ThinkingLevel.Medium,
    ]);
    expect(model.capabilities).toEqual({
      toolUse: true,
      nested: { modes: ["json"] },
    });
    expect(model.metadata).toEqual({
      families: ["gpt"],
      nested: { tier: "fast" },
    });
  });

  it("cloneAgentConfig returns independent plugin, provider, generation, and default model snapshots", () => {
    const config: NormalizedAgentConfig = AgentConfigSchema.parse({
      providers: [
        {
          provider: "openai",
          key: "test-key",
          models: [
            {
              id: "fast",
              name: "gpt-4o-mini",
              thinkingLevels: [ThinkingLevel.None],
              metadata: { owner: { team: "core" } },
            },
          ],
        },
      ],
      defaultModel: { id: "fast", provider: "openai" },
      generation: {
        temperature: 0.2,
        thinking: ThinkingLevel.Low,
      },
      plugins: new Map([["search", { enabled: true }]]),
      paths: { sessiondir: "session-a" },
    });

    const cloned = cloneAgentConfig(config);

    cloned.plugins.set("extra", { enabled: false });
    cloned.providers[0]!.models[0]!.metadata!.owner = { team: "mutated" };
    cloned.generation!.temperature = 1.2;
    cloned.defaultModel = { id: "slow", provider: "openai" };
    cloned.paths.sessiondir = "session-b";

    expect(config.plugins.has("extra")).toBe(false);
    expect(config.providers[0]!.models[0]!.metadata).toEqual({
      owner: { team: "core" },
    });
    expect(config.generation).toEqual({
      temperature: 0.2,
      thinking: ThinkingLevel.Low,
    });
    expect(config.defaultModel).toEqual({ id: "fast", provider: "openai" });
    expect(config.paths.sessiondir).toBe("session-a");
  });

  it("describes selectors, lists available models, and builds selectors from resolved models", () => {
    const models: ResolvedModel[] = [
      {
        id: "fast",
        provider: "openai",
        name: "gpt-4o-mini",
        thinkingLevels: [ThinkingLevel.None],
      },
      {
        id: "balanced",
        provider: "anthropic",
        name: "claude-sonnet",
        thinkingLevels: [ThinkingLevel.None, ThinkingLevel.High],
      },
    ];

    expect(selectorDescription({ id: "fast" })).toBe("fast");
    expect(selectorDescription({ id: "fast", provider: "openai" })).toBe("openai:fast");
    expect(selectorDescription({ provider: "openai", model: "gpt-4o-mini" })).toBe("openai/gpt-4o-mini");
    expect(availableModelIds(models)).toBe("openai:fast, anthropic:balanced");
    expect(availableModelIds([])).toBe("(none)");
    expect(selectorFromResolvedModel(models[0]!)).toEqual({
      id: "fast",
      provider: "openai",
    });
  });

  it("validateUniqueProviders throws for duplicate providers", () => {
    expect(() =>
      validateUniqueProviders([
        { provider: "openai", key: "first-key" },
        { provider: "anthropic", key: "other-key" },
        { provider: "openai", key: "second-key" },
      ]),
    ).toThrow('Duplicate provider: "openai"');
  });
});

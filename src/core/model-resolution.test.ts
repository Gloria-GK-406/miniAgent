import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "./config.js";
import type {
  ModelProviderConfig,
  ResolvedModel,
} from "./config.js";
import { resolveModelsFromProviders, selectResolvedModel } from "./model-resolution.js";
import type { LLMRequest } from "./types.js";

function llmWithModels(models: Record<string, ResolvedModel[]>): Pick<LLMRequest, "getEngineModels"> {
  return {
    getEngineModels(provider: string): ResolvedModel[] {
      return models[provider]?.map((model) => ({
        ...model,
        thinkingLevels: [...model.thinkingLevels],
        ...(model.capabilities !== undefined && {
          capabilities: structuredClone(model.capabilities),
        }),
        ...(model.metadata !== undefined && {
          metadata: structuredClone(model.metadata),
        }),
      })) ?? [];
    },
  };
}

describe("resolveModelsFromProviders", () => {
  it("exposes all engine presets when provider model overrides are absent", () => {
    const engineModels: ResolvedModel[] = [
      {
        id: "fast",
        provider: "openai",
        name: "gpt-4o-mini",
        contextSize: 128000,
        maxOutputTokens: 16384,
        thinkingLevels: [ThinkingLevel.None],
        capabilities: { toolUse: true },
        metadata: { family: "gpt" },
      },
      {
        id: "reasoning",
        provider: "openai",
        name: "o3",
        thinkingLevels: [ThinkingLevel.None, ThinkingLevel.High],
      },
    ];

    const resolved = resolveModelsFromProviders(
      [{ provider: "openai", key: "test-key" }],
      llmWithModels({ openai: engineModels }),
    );

    expect(resolved).toEqual(engineModels);
    resolved[0]!.thinkingLevels.push(ThinkingLevel.Max);
    resolved[0]!.capabilities = { toolUse: false };

    expect(resolveModelsFromProviders(
      [{ provider: "openai", key: "test-key" }],
      llmWithModels({ openai: engineModels }),
    )[0]).toEqual(engineModels[0]);
  });

  it("overlays provider models by name or id and keeps engine preset metadata", () => {
    const providers: ModelProviderConfig[] = [
      {
        provider: "openai",
        key: "test-key",
        models: [
          {
            id: "fast",
            name: "gpt-4o-mini",
            contextSize: 64000,
          },
          {
            id: "stable-id",
            name: "provider-renamed-model",
          },
          {
            id: "local",
            name: "custom-model",
            maxOutputTokens: 4096,
            thinkingLevels: [ThinkingLevel.None],
          },
        ],
      },
    ];
    const llm = llmWithModels({
      openai: [
        {
          id: "engine-fast",
          provider: "openai",
          name: "gpt-4o-mini",
          contextSize: 128000,
          maxOutputTokens: 16384,
          thinkingLevels: [ThinkingLevel.None],
          capabilities: { toolUse: true },
          metadata: { source: "engine" },
        },
        {
          id: "stable-id",
          provider: "openai",
          name: "engine-name",
          contextSize: 200000,
          maxOutputTokens: 32768,
          thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
          metadata: { matched: "id" },
        },
      ],
    });

    expect(resolveModelsFromProviders(providers, llm)).toEqual([
      {
        id: "fast",
        provider: "openai",
        name: "gpt-4o-mini",
        contextSize: 64000,
        maxOutputTokens: 16384,
        thinkingLevels: [ThinkingLevel.None],
        capabilities: { toolUse: true },
        metadata: { source: "engine" },
      },
      {
        id: "stable-id",
        provider: "openai",
        name: "provider-renamed-model",
        contextSize: 200000,
        maxOutputTokens: 32768,
        thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
        metadata: { matched: "id" },
      },
      {
        id: "local",
        provider: "openai",
        name: "custom-model",
        maxOutputTokens: 4096,
        thinkingLevels: [ThinkingLevel.None],
      },
    ]);
  });

  it("prefers exact id matches over name matches when both point to different presets", () => {
    const resolved = resolveModelsFromProviders(
      [
        {
          provider: "openai",
          key: "test-key",
          models: [
            {
              id: "stable-id",
              name: "shared-name",
              contextSize: 64000,
            },
          ],
        },
      ],
      llmWithModels({
        openai: [
          {
            id: "name-match",
            provider: "openai",
            name: "shared-name",
            maxOutputTokens: 1024,
            thinkingLevels: [ThinkingLevel.None],
            capabilities: { matchedBy: "name" },
          },
          {
            id: "stable-id",
            provider: "openai",
            name: "different-name",
            maxOutputTokens: 32768,
            thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
            capabilities: { matchedBy: "id" },
          },
        ],
      }),
    );

    expect(resolved).toEqual([
      {
        id: "stable-id",
        provider: "openai",
        name: "shared-name",
        contextSize: 64000,
        maxOutputTokens: 32768,
        thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
        capabilities: { matchedBy: "id" },
      },
    ]);
  });

  it("throws when provider override name fallback matches multiple engine presets", () => {
    expect(() =>
      resolveModelsFromProviders(
        [
          {
            provider: "openai",
            key: "test-key",
            models: [
              {
                id: "new-alias",
                name: "shared-name",
              },
            ],
          },
        ],
        llmWithModels({
          openai: [
            {
              id: "fast",
              provider: "openai",
              name: "shared-name",
              thinkingLevels: [ThinkingLevel.None],
            },
            {
              id: "balanced",
              provider: "openai",
              name: "shared-name",
              thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
            },
          ],
        }),
      ),
    ).toThrow(/openai.*new-alias.*shared-name.*fast.*balanced/i);
  });
});

describe("selectResolvedModel", () => {
  const models: ResolvedModel[] = [
    {
      id: "fast",
      provider: "openai",
      name: "gpt-4o-mini",
      thinkingLevels: [ThinkingLevel.None],
    },
    {
      id: "fast",
      provider: "azure-openai",
      name: "gpt-4o-mini",
      thinkingLevels: [ThinkingLevel.None],
    },
    {
      id: "reasoning",
      provider: "anthropic",
      name: "claude-sonnet",
      thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
    },
  ];

  it("defaults to the first model", () => {
    expect(selectResolvedModel(models, undefined)).toEqual(models[0]);
  });

  it("matches by id", () => {
    expect(selectResolvedModel(models, { id: "reasoning" })).toEqual(models[2]);
  });

  it("respects provider when supplied with an id", () => {
    expect(selectResolvedModel(
      models,
      { id: "fast", provider: "azure-openai" },
    )).toEqual(models[1]);
  });

  it("supports provider/name selectors", () => {
    expect(selectResolvedModel(models, {
      provider: "anthropic",
      model: "claude-sonnet",
    })).toEqual(models[2]);
  });

  it("throws when an id selector is ambiguous without a provider", () => {
    expect(() => selectResolvedModel(models, { id: "fast" })).toThrow(
      /ambiguous.*openai:fast.*azure-openai:fast/i,
    );
  });

  it("throws when a provider/name selector matches multiple aliases", () => {
    const duplicateNames: ResolvedModel[] = [
      {
        id: "fast",
        provider: "openai",
        name: "gpt-4o-mini",
        thinkingLevels: [ThinkingLevel.None],
      },
      {
        id: "balanced",
        provider: "openai",
        name: "gpt-4o-mini",
        thinkingLevels: [ThinkingLevel.None],
      },
    ];

    expect(() => selectResolvedModel(duplicateNames, {
      provider: "openai",
      model: "gpt-4o-mini",
    })).toThrow(/ambiguous.*openai:fast.*openai:balanced/i);
  });
});

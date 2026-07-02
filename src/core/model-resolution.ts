import type {
  JsonValue,
  ModelPreset,
  ModelProviderConfig,
  ModelSelector,
  ResolvedModel,
} from "./config.js";
import { ModelPresetSchema, ThinkingLevel } from "./config.js";
import type { LLMRequest } from "./types.js";

function cloneJsonRecord<T extends Record<string, JsonValue>>(value: T): T {
  return structuredClone(value) as T;
}

function cloneResolvedModel(model: ResolvedModel): ResolvedModel {
  return {
    id: model.id,
    provider: model.provider,
    name: model.name,
    ...(model.displayName !== undefined && { displayName: model.displayName }),
    ...(model.contextSize !== undefined && { contextSize: model.contextSize }),
    ...(model.maxOutputTokens !== undefined && { maxOutputTokens: model.maxOutputTokens }),
    thinkingLevels: [...model.thinkingLevels],
    ...(model.capabilities !== undefined && {
      capabilities: cloneJsonRecord(model.capabilities),
    }),
    ...(model.metadata !== undefined && {
      metadata: cloneJsonRecord(model.metadata),
    }),
  };
}

function resolveProviderOverride(
  provider: ModelProviderConfig,
  engineModels: ResolvedModel[],
  override: ModelPreset,
): ResolvedModel {
  const parsedOverride = ModelPresetSchema.parse(override);
  const preset = findMatchingPreset(provider, engineModels, parsedOverride);
  const base = preset ? cloneResolvedModel(preset) : undefined;
  const thinkingLevels = parsedOverride.thinkingLevels
    ? [...parsedOverride.thinkingLevels]
    : (base?.thinkingLevels ? [...base.thinkingLevels] : [ThinkingLevel.None]);

  return {
    ...(base ?? {
      thinkingLevels,
    }),
    id: parsedOverride.id,
    provider: provider.provider,
    name: parsedOverride.name,
    ...(parsedOverride.displayName !== undefined && { displayName: parsedOverride.displayName }),
    ...(parsedOverride.contextSize !== undefined && { contextSize: parsedOverride.contextSize }),
    ...(parsedOverride.maxOutputTokens !== undefined && { maxOutputTokens: parsedOverride.maxOutputTokens }),
    thinkingLevels,
    ...(parsedOverride.capabilities !== undefined && {
      capabilities: cloneJsonRecord(parsedOverride.capabilities),
    }),
    ...(parsedOverride.metadata !== undefined && {
      metadata: cloneJsonRecord(parsedOverride.metadata),
    }),
  };
}

function findMatchingPreset(
  provider: ModelProviderConfig,
  engineModels: ResolvedModel[],
  override: ModelPreset,
): ResolvedModel | undefined {
  const idMatch = engineModels.find((model) => model.id === override.id);
  if (idMatch) {
    return idMatch;
  }

  const nameMatches = engineModels.filter((model) => model.name === override.name);
  if (nameMatches.length > 1) {
    throw new Error(
      `Ambiguous provider model override for provider "${provider.provider}" with id "${override.id}" and name "${override.name}". Matching engine model ids: ${nameMatches.map((model) => model.id).join(", ")}`,
    );
  }
  return nameMatches[0];
}

export function resolveModelsFromProviders(
  providers: ModelProviderConfig[],
  llm: Pick<LLMRequest, "getEngineModels">,
): ResolvedModel[] {
  return providers.flatMap((provider) => {
    const engineModels = llm.getEngineModels(provider.provider).map((model) => ({
      ...cloneResolvedModel(model),
      provider: provider.provider,
    }));
    const providerModels = provider.models ?? [];
    if (providerModels.length === 0) {
      return engineModels;
    }
    return providerModels.map((model) =>
      resolveProviderOverride(provider, engineModels, model),
    );
  });
}

function availableModelIds(models: ResolvedModel[]): string {
  return models.map((model) => `${model.provider}:${model.id}`).join(", ") || "(none)";
}

function selectorDescription(selector: ModelSelector): string {
  if ("id" in selector) {
    return selector.provider !== undefined
      ? `${selector.provider}:${selector.id}`
      : selector.id;
  }
  return `${selector.provider}/${selector.model}`;
}

function selectUniqueMatch(
  models: ResolvedModel[],
  selector: ModelSelector,
  matches: ResolvedModel[],
): ResolvedModel | undefined {
  if (matches.length > 1) {
    throw new Error(
      `Model selector is ambiguous: ${selectorDescription(selector)}. Available models: ${availableModelIds(matches)}. All models: ${availableModelIds(models)}`,
    );
  }
  const match = matches[0];
  return match ? cloneResolvedModel(match) : undefined;
}

export function selectResolvedModel(
  models: ResolvedModel[],
  selector: ModelSelector | undefined,
): ResolvedModel | undefined {
  if (!selector) {
    const first = models[0];
    return first ? cloneResolvedModel(first) : undefined;
  }

  const provider = "provider" in selector ? selector.provider : undefined;
  const id = "id" in selector ? selector.id : undefined;
  if (id !== undefined) {
    const matches = models.filter((model) =>
      model.id === id && (provider === undefined || model.provider === provider),
    );
    const selected = selectUniqueMatch(models, selector, matches);
    if (selected) {
      return selected;
    }
  }

  const modelName = "model" in selector ? selector.model : undefined;
  if (modelName !== undefined) {
    const matches = models.filter((model) =>
      model.name === modelName && (provider === undefined || model.provider === provider),
    );
    const selected = selectUniqueMatch(models, selector, matches);
    if (selected) {
      return selected;
    }
  }

  return undefined;
}

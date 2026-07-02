import {
  AgentConfigSchema,
  type GenerationConfig,
  type JsonValue,
  type ModelPreset,
  type ModelProviderConfig,
  type ModelSelector,
  type NormalizedAgentConfig,
  type ResolvedModel,
} from "./config.js";

export function cloneJsonRecord<T extends Record<string, JsonValue>>(value: T): T {
  return structuredClone(value) as T;
}

export function cloneModelPreset(model: ModelPreset): ModelPreset {
  return {
    id: model.id,
    name: model.name,
    ...(model.displayName !== undefined && { displayName: model.displayName }),
    ...(model.contextSize !== undefined && { contextSize: model.contextSize }),
    ...(model.maxOutputTokens !== undefined && { maxOutputTokens: model.maxOutputTokens }),
    ...(model.thinkingLevels !== undefined && {
      thinkingLevels: [...model.thinkingLevels],
    }),
    ...(model.capabilities !== undefined && {
      capabilities: cloneJsonRecord(model.capabilities),
    }),
    ...(model.metadata !== undefined && {
      metadata: cloneJsonRecord(model.metadata),
    }),
  };
}

export function cloneProviderConfig(provider: ModelProviderConfig): ModelProviderConfig {
  return {
    provider: provider.provider,
    key: provider.key,
    ...(provider.baseUrl !== undefined && { baseUrl: provider.baseUrl }),
    models: (provider.models ?? []).map(cloneModelPreset),
  };
}

export function cloneResolvedModel(model: ResolvedModel): ResolvedModel {
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

export function cloneGenerationConfig(config: GenerationConfig): GenerationConfig {
  return { ...config };
}

export function cloneSelector(selector: ModelSelector): ModelSelector {
  if ("id" in selector) {
    return {
      id: selector.id,
      ...(selector.provider !== undefined && { provider: selector.provider }),
    };
  }
  return {
    provider: selector.provider,
    model: selector.model,
  };
}

export function cloneAgentConfig(config: NormalizedAgentConfig): NormalizedAgentConfig {
  return AgentConfigSchema.parse({
    providers: config.providers.map(cloneProviderConfig),
    ...(config.defaultModel !== undefined && {
      defaultModel: cloneSelector(config.defaultModel),
    }),
    ...(config.generation !== undefined && {
      generation: cloneGenerationConfig(config.generation),
    }),
    plugins: new Map(config.plugins),
    paths: { ...config.paths },
  });
}

export function selectorDescription(selector: ModelSelector): string {
  if ("id" in selector) {
    return selector.provider !== undefined
      ? `${selector.provider}:${selector.id}`
      : selector.id;
  }
  return `${selector.provider}/${selector.model}`;
}

export function availableModelIds(models: ResolvedModel[]): string {
  return models.map((model) => `${model.provider}:${model.id}`).join(", ") || "(none)";
}

export function selectorFromResolvedModel(model: ResolvedModel): ModelSelector {
  return {
    id: model.id,
    provider: model.provider,
  };
}

export function validateUniqueProviders(providers: ModelProviderConfig[]): void {
  const seen = new Set<string>();
  for (const provider of providers) {
    if (seen.has(provider.provider)) {
      throw new Error(`Duplicate provider: "${provider.provider}"`);
    }
    seen.add(provider.provider);
  }
}

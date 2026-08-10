import { z } from "zod";
import { ModelPresetSchema, ThinkingLevel, type ModelPreset } from "../core/index.js";
import { ANTHROPIC_MODEL_PRESETS } from "../engine/index.js";
import { GLM_CODEPLAN_MODEL_PRESETS } from "../engine/index.js";
import { GLM_MODEL_PRESETS } from "../engine/index.js";
import { OPENAI_MODEL_PRESETS } from "../engine/index.js";
import type { CLIProviderConnection } from "./runtime/types.js";

export const ConnectProviderIdSchema = z.enum(["openai", "anthropic", "glm", "glm-codeplan", "nvidia", "custom"]);
export type ConnectProviderId = z.infer<typeof ConnectProviderIdSchema>;

export const ConnectProviderOptionSchema = z.object({
  id: ConnectProviderIdSchema,
  label: z.string(),
  engine: z.string(),
  models: z.array(z.lazy(() => ModelPresetSchema)),
  requiresBaseURL: z.boolean(),
  requiresModel: z.boolean(),
});
export type ConnectProviderOption = z.infer<typeof ConnectProviderOptionSchema>;

export const BuildProviderConnectionInputSchema = z.object({
  providerId: ConnectProviderIdSchema,
  apiKey: z.string(),
  baseURL: z.string().optional(),
  modelId: z.string().optional(),
});
export type BuildProviderConnectionInput = z.infer<typeof BuildProviderConnectionInputSchema>;

function cloneModels(models: ModelPreset[]): ModelPreset[] {
  return models.map((model) => structuredClone(model));
}

export const CONNECT_PROVIDER_OPTIONS: ConnectProviderOption[] = [
  {
    id: "openai",
    label: "OpenAI",
    engine: "openai",
    models: OPENAI_MODEL_PRESETS,
    requiresBaseURL: false,
    requiresModel: false,
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    engine: "anthropic",
    models: ANTHROPIC_MODEL_PRESETS,
    requiresBaseURL: false,
    requiresModel: false,
  },
  {
    id: "glm",
    label: "Zhipu GLM",
    engine: "glm",
    models: GLM_MODEL_PRESETS,
    requiresBaseURL: false,
    requiresModel: false,
  },
  {
    id: "glm-codeplan",
    label: "Zhipu GLM CodePlan",
    engine: "glm-codeplan",
    models: GLM_CODEPLAN_MODEL_PRESETS,
    requiresBaseURL: false,
    requiresModel: false,
  },
  {
    id: "nvidia",
    label: "NVIDIA",
    engine: "nvidia",
    models: [],
    requiresBaseURL: false,
    requiresModel: true,
  },
  {
    id: "custom",
    label: "Other Custom provider",
    engine: "openai-compatible",
    models: [],
    requiresBaseURL: true,
    requiresModel: true,
  },
];

function findProviderOption(providerId: ConnectProviderId): ConnectProviderOption {
  const option = CONNECT_PROVIDER_OPTIONS.find((entry) => entry.id === providerId);
  if (option === undefined) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return option;
}

function requireTrimmed(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function customModel(modelId: string): ModelPreset {
  return {
    id: modelId,
    name: modelId,
    thinkingLevels: [ThinkingLevel.None],
  };
}

export function buildProviderConnection(input: BuildProviderConnectionInput): CLIProviderConnection {
  const option = findProviderOption(input.providerId);
  const key = requireTrimmed(input.apiKey, "API key");
  const baseURL = input.baseURL?.trim();
  if (option.requiresBaseURL && (baseURL === undefined || baseURL.length === 0)) {
    throw new Error("Base URL is required");
  }

  const models = option.requiresModel
    ? [customModel(requireTrimmed(input.modelId, "Model id"))]
    : cloneModels(option.models);
  const firstModel = models[0];
  if (firstModel === undefined) {
    throw new Error(`${option.label} has no model presets`);
  }

  return {
    engine: option.engine,
    key,
    ...(baseURL !== undefined && baseURL.length > 0 && { baseURL }),
    models,
    defaultModel: `${option.engine}/${firstModel.id}`,
  };
}

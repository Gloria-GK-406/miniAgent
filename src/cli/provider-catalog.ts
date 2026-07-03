import { ThinkingLevel, type ModelPreset } from "../core/config.js";
import { ANTHROPIC_MODEL_PRESETS } from "../engine/anthropic/models.js";
import { GLM_CODEPLAN_MODEL_PRESETS } from "../engine/glm-codeplan/models.js";
import { GLM_MODEL_PRESETS } from "../engine/glm/models.js";
import { OPENAI_MODEL_PRESETS } from "../engine/openai/models.js";
import type { CLIProviderConnection } from "./runtime/types.js";

export type ConnectProviderId =
  | "openai"
  | "anthropic"
  | "glm"
  | "glm-codeplan"
  | "nvidia"
  | "custom";

export interface ConnectProviderOption {
  id: ConnectProviderId;
  label: string;
  engine: string;
  models: ModelPreset[];
  requiresBaseURL: boolean;
  requiresModel: boolean;
}

export interface BuildProviderConnectionInput {
  providerId: ConnectProviderId;
  apiKey: string;
  baseURL?: string;
  modelId?: string;
}

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

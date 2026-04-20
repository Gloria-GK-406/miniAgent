import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ModelConfig } from "../../src/core/config.js";
import { MessageType } from "../../src/core/types.js";
import type { LLMEngineCtor } from "../../src/core/llm.js";
import type { LLMResponse, LLMMessageResponse, Message, ToolCallMessage, Tool } from "../../src/core/types.js";

const envCache = new Map<string, string | undefined>();

function loadEnv(): void {
  if (envCache.size > 0) return;
  const envPath = resolve(process.cwd(), ".test.env");
  let content: string;
  try {
    content = readFileSync(envPath, "utf-8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    envCache.set(key, val);
  }
}

export function getEnv(key: string): string | undefined {
  loadEnv();
  const fromEnv = process.env[key];
  if (fromEnv) return fromEnv;
  return envCache.get(key);
}

export function requireEnv(key: string): string {
  const val = getEnv(key);
  if (!val) {
    throw new Error(`Missing required env var: ${key}. Copy .test.env.example to .test.env and fill it in.`);
  }
  return val;
}

export type ProviderKey =
  | "ANTHROPIC"
  | "OPENAI"
  | "OPENAI_COMPATIBLE"
  | "GLM"
  | "GLM_CODEPLAN"
  | "NVIDIA";

export function getProviderConfig(
  provider: ProviderKey,
  providerName: string,
  baseUrl?: string,
): ModelConfig {
  return {
    provider: providerName,
    model: requireEnv("PROVIDER_" + provider + "_MODEL"),
    apiKey: requireEnv("PROVIDER_" + provider + "_API_KEY"),
    baseUrl: baseUrl ?? "",
  };
}

export function isProviderConfigured(provider: ProviderKey): boolean {
  const key = getEnv("PROVIDER_" + provider + "_API_KEY");
  return !!key && key.length > 0;
}

export async function invokeEngine(
  Engine: LLMEngineCtor,
  config: ModelConfig,
  messages: Message[],
  tools: Tool[],
): Promise<LLMResponse> {
  const engine = new Engine(config);
  return await engine.streamGenerate(messages, tools);
}

export async function invokeEngineForSmoke(
  Engine: LLMEngineCtor,
  config: ModelConfig,
  messages: Message[],
  tools: Tool[],
): Promise<LLMResponse | null> {
  try {
    return await invokeEngine(Engine, config, messages, tools);
  } catch (error: unknown) {
    if (isKnownSmokeInfraError(error)) {
      return null;
    }
    throw error;
  }
}

export function isAssistResponse(response: LLMResponse): response is LLMResponse & {
  message: Extract<LLMMessageResponse, { type: MessageType.Assist }>;
} {
  return !Array.isArray(response.message) && response.message.type === MessageType.Assist;
}

export function isToolCallResponse(response: LLMResponse): response is LLMResponse & {
  message: ToolCallMessage[];
} {
  return Array.isArray(response.message) && response.message.every((message) => message.type === MessageType.ToolCall);
}

function isKnownSmokeInfraError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return message.includes("429")
    || message.includes("速率限制")
    || message.includes("未正常接收到prompt参数");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeGenerationConfig,
  ThinkingLevel,
  type GenerationConfigInput,
  type LLMGenerateRequest,
  type ModelProviderConfig,
  type ResolvedModel,
} from "../../src/core/config.js";
import { LLMEngineManager, emptyTokenCount, type LLMEngine } from "../../src/core/llm.js";
import { resolveModelsFromProviders, selectResolvedModel } from "../../src/core/model-resolution.js";
import {
  LLMStreamChunkType,
  MessageType,
  type LLMMessageResponse,
  type LLMResponse,
  type Message,
  type MessageChunk,
  type Tool,
  type ToolCallMessage,
} from "../../src/core/types.js";

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
): ModelProviderConfig {
  return {
    provider: providerName,
    key: requireEnv("PROVIDER_" + provider + "_API_KEY"),
    ...(baseUrl !== undefined && { baseUrl }),
    models: [],
  };
}

export function getProviderModel(provider: ProviderKey): string {
  return requireEnv("PROVIDER_" + provider + "_MODEL");
}

export function isProviderConfigured(provider: ProviderKey): boolean {
  const key = getEnv("PROVIDER_" + provider + "_API_KEY");
  return !!key && key.length > 0;
}

export interface InvokeEngineOptions {
  generation?: GenerationConfigInput;
  onChunk?: (chunk: MessageChunk) => void;
}

export function buildGenerateRequest(
  engine: LLMEngine,
  providerConfig: ModelProviderConfig,
  modelName: string,
  messages: Message[],
  tools: Tool[],
  generation?: GenerationConfigInput,
): LLMGenerateRequest {
  return {
    messages,
    tools,
    provider: providerConfig,
    model: resolveSmokeModel(engine, providerConfig, modelName),
    generation: normalizeGenerationConfig(generation),
  };
}

export async function invokeEngine(
  engine: LLMEngine,
  providerConfig: ModelProviderConfig,
  modelName: string,
  messages: Message[],
  tools: Tool[],
  options: InvokeEngineOptions = {},
): Promise<LLMResponse> {
  const request = buildGenerateRequest(
    engine,
    providerConfig,
    modelName,
    messages,
    tools,
    options.generation,
  );
  return await collectStreamResponse(engine.streamGenerate(request), options.onChunk);
}

export async function invokeEngineForSmoke(
  engine: LLMEngine,
  providerConfig: ModelProviderConfig,
  modelName: string,
  messages: Message[],
  tools: Tool[],
  options: InvokeEngineOptions = {},
): Promise<LLMResponse | null> {
  try {
    return await invokeEngine(engine, providerConfig, modelName, messages, tools, options);
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

interface ToolCallBuffer {
  id?: string;
  name?: string;
  argumentsText: string;
}

const FALLBACK_THINKING_LEVELS = [
  ThinkingLevel.None,
  ThinkingLevel.Low,
  ThinkingLevel.Medium,
  ThinkingLevel.High,
  ThinkingLevel.Max,
] as const;

function resolveSmokeModel(
  engine: LLMEngine,
  providerConfig: ModelProviderConfig,
  modelName: string,
): ResolvedModel {
  const llm = new LLMEngineManager();
  llm.register(engine);
  const resolvedModels = resolveModelsFromProviders([providerConfig], llm);
  const selectedById = selectResolvedModel(resolvedModels, {
    provider: providerConfig.provider,
    id: modelName,
  });
  if (selectedById) {
    return selectedById;
  }
  const selectedByName = selectResolvedModel(resolvedModels, {
    provider: providerConfig.provider,
    model: modelName,
  });
  if (selectedByName) {
    return selectedByName;
  }

  return {
    id: modelName,
    provider: providerConfig.provider,
    name: modelName,
    thinkingLevels: [...FALLBACK_THINKING_LEVELS],
  };
}

function getToolCallBuffer(buffers: ToolCallBuffer[], index: number): ToolCallBuffer {
  const existing = buffers[index];
  if (existing) {
    return existing;
  }
  const created: ToolCallBuffer = {
    argumentsText: "",
  };
  buffers[index] = created;
  return created;
}

function parseToolArguments(toolCall: ToolCallBuffer): Record<string, unknown> {
  if (toolCall.argumentsText === "") {
    return {};
  }
  return JSON.parse(toolCall.argumentsText) as Record<string, unknown>;
}

async function collectStreamResponse(
  stream: AsyncGenerator<MessageChunk>,
  onChunk?: (chunk: MessageChunk) => void,
): Promise<LLMResponse> {
  let content = "";
  let reasoningContent = "";
  const toolCalls: ToolCallBuffer[] = [];

  for await (const chunk of stream) {
    onChunk?.(chunk);
    switch (chunk.type) {
      case LLMStreamChunkType.TextDelta:
        content += chunk.text;
        break;
      case LLMStreamChunkType.ReasoningDelta:
        reasoningContent += chunk.text;
        break;
      case LLMStreamChunkType.ToolCallArgumentsDelta: {
        const buffer = getToolCallBuffer(toolCalls, chunk.index);
        buffer.argumentsText += chunk.argsText;
        if (chunk.toolCallId !== undefined) {
          buffer.id = chunk.toolCallId;
        }
        if (chunk.toolName !== undefined) {
          buffer.name = chunk.toolName;
        }
        break;
      }
    }
  }

  if (toolCalls.length > 0) {
    return {
      message: toolCalls.map((toolCall) => {
        if (!toolCall.id) {
          throw new Error("LLM stream ended without a tool call id");
        }
        if (!toolCall.name) {
          throw new Error("LLM stream ended without a tool name");
        }
        return {
          id: crypto.randomUUID(),
          type: MessageType.ToolCall,
          content,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          arguments: parseToolArguments(toolCall),
          ...(reasoningContent !== "" && { reasoningContent }),
        };
      }),
      tokenCount: emptyTokenCount(),
    };
  }

  return {
    message: {
      id: crypto.randomUUID(),
      type: MessageType.Assist,
      content,
      ...(reasoningContent !== "" && { reasoningContent }),
    },
    tokenCount: emptyTokenCount(),
  };
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

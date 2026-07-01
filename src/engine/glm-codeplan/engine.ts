import OpenAI from "openai";
import { createLLMStreamHandle, type LLMEngine, type ModelCatalogLLMEngine } from "../../core/llm.js";
import {
  type LLMGenerateRequest,
  type ModelConfig,
  type ModelPreset,
} from "../../core/config.js";
import { type Message, type Tool, type LLMResponse, type LLMStreamHandle } from "../../core/types.js";
import type {
  ChatCompletionChunk,
} from "openai/resources/chat/completions/completions.js";
import {
  buildCreateParams,
  buildCreateParamsFromRequest,
} from "../glm/convert.js";
import { GLM_CODEPLAN_MODEL_PRESETS } from "./models.js";
import { consumeOpenAIStream } from "../openai-compatible/stream.js";

const GLM_CODEPLAN_BASE_URL = "https://open.bigmodel.cn/api/coding/paas/v4";

function extractReasoningDelta(chunk: ChatCompletionChunk): string | undefined {
  const choice = chunk.choices[0];
  if (!choice) {
    return undefined;
  }
  return (choice.delta as { reasoning_content?: string }).reasoning_content;
}

type CreateParams =
  | ReturnType<typeof buildCreateParams>
  | ReturnType<typeof buildCreateParamsFromRequest>;

function cloneModelPresets(presets: ModelPreset[]): ModelPreset[] {
  return presets.map((model) => ({
    ...model,
    thinkingLevels: [...model.thinkingLevels],
  }));
}

export class GLMCodePlanEngine implements LLMEngine, ModelCatalogLLMEngine {
  readonly name = "glm-codeplan";

  private client?: OpenAI;
  private config?: ModelConfig;

  constructor(config?: ModelConfig) {
    if (config) {
      this.config = config;
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || GLM_CODEPLAN_BASE_URL,
      });
    }
  }

  getModels(): ModelPreset[] {
    return cloneModelPresets(GLM_CODEPLAN_MODEL_PRESETS);
  }

  streamGenerate(request: LLMGenerateRequest): LLMStreamHandle<LLMResponse>;
  streamGenerate(
    messages: Message[],
    tools: Tool[],
  ): LLMStreamHandle<LLMResponse>;
  streamGenerate(
    requestOrMessages: LLMGenerateRequest | Message[],
    tools?: Tool[],
  ): LLMStreamHandle<LLMResponse> {
    if (Array.isArray(requestOrMessages)) {
      if (!this.config || !this.client || !tools) {
        throw new Error(
          "GLMCodePlanEngine legacy streamGenerate requires constructor config",
        );
      }
      return this.streamWithClient(
        this.client,
        buildCreateParams(requestOrMessages, this.config, tools),
      );
    }

    const client = new OpenAI({
      apiKey: requestOrMessages.provider.apiKey,
      baseURL: requestOrMessages.provider.baseUrl || GLM_CODEPLAN_BASE_URL,
    });
    return this.streamWithClient(
      client,
      buildCreateParamsFromRequest(requestOrMessages),
    );
  }

  private streamWithClient(
    client: OpenAI,
    params: CreateParams,
  ): LLMStreamHandle<LLMResponse> {
    const controller = createLLMStreamHandle<LLMResponse>();

    void (async () => {
      try {
        const stream = await client.chat.completions.create({
          ...params,
          stream: true,
          stream_options: {
            include_usage: true,
          },
        });
        const response = await consumeOpenAIStream(stream, {
          emitChunk: (chunk) => {
            controller.emitChunk(chunk);
          },
          extractReasoningDelta,
          shouldBreak: () => controller.isAborted(),
        });
        controller.resolve(response);
      } catch (error: unknown) {
        controller.reject(error);
      }
    })();
    return controller.handle;
  }
}

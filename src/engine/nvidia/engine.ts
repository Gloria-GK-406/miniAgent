import OpenAI from "openai";
import { createLLMStreamHandle, type LLMEngine, type ModelCatalogLLMEngine } from "../../core/llm.js";
import {
  type LLMGenerateRequest,
  type ModelConfig,
  type ModelPreset,
} from "../../core/config.js";
import { type Message, type Tool, type LLMResponse, type LLMStreamHandle } from "../../core/types.js";
import {
  buildCreateParams,
  buildCreateParamsFromRequest,
} from "../openai-compatible/convert.js";
import { NVIDIA_MODEL_PRESETS } from "./models.js";
import { consumeNVIDIAStream } from "./stream.js";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

type CreateParams =
  | ReturnType<typeof buildCreateParams>
  | ReturnType<typeof buildCreateParamsFromRequest>;

function cloneModelPresets(presets: ModelPreset[]): ModelPreset[] {
  return presets.map((model) => ({
    ...model,
    thinkingLevels: [...model.thinkingLevels],
  }));
}

export class NVIDIAEngine implements LLMEngine, ModelCatalogLLMEngine {
  readonly name = "nvidia";

  private client?: OpenAI;
  private config?: ModelConfig;

  constructor(config?: ModelConfig) {
    if (config) {
      this.config = config;
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || NVIDIA_BASE_URL,
      });
    }
  }

  getModels(): ModelPreset[] {
    return cloneModelPresets(NVIDIA_MODEL_PRESETS);
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
          "NVIDIAEngine legacy streamGenerate requires constructor config",
        );
      }
      return this.streamWithClient(
        this.client,
        buildCreateParams(requestOrMessages, this.config, tools),
      );
    }

    const client = new OpenAI({
      apiKey: requestOrMessages.provider.apiKey,
      baseURL: requestOrMessages.provider.baseUrl || NVIDIA_BASE_URL,
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
        const response = await consumeNVIDIAStream(stream, {
          emitChunk: (chunk) => {
            controller.emitChunk(chunk);
          },
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

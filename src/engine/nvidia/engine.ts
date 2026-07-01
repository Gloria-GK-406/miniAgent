import OpenAI from "openai";
import type { Message, Tool, LLMResponse, LLMStreamHandle } from "../../core/types.js";
import type { LegacyLLMEngine, LLMEngineCtor } from "../../core/llm.js";
import { createLLMStreamHandle } from "../../core/llm.js";
import type { ModelConfig } from "../../core/config.js";
import {
  buildCreateParams,
} from "../openai-compatible/convert.js";
import { consumeNVIDIAStream } from "./stream.js";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export const NVIDIAEngine: LLMEngineCtor = class implements LegacyLLMEngine {
  private client: OpenAI;
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || NVIDIA_BASE_URL,
    });
  }

  streamGenerate(
    messages: Message[],
    tools: Tool[],
  ): LLMStreamHandle<LLMResponse> {
    const params = buildCreateParams(messages, this.config, tools);
    const controller = createLLMStreamHandle<LLMResponse>();

    void (async () => {
      try {
        const stream = await this.client.chat.completions.create({
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
};

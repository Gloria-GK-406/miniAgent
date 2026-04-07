import OpenAI from "openai";
import type { Message, Tool, LLMResponse, LLMStreamHandle } from "../../core/types.js";
import type { LLMEngine, LLMEngineCtor } from "../../core/llm.js";
import { createLLMStreamHandle } from "../../core/llm.js";
import type { ModelConfig } from "../../core/config.js";
import type {
  ChatCompletionChunk,
} from "openai/resources/chat/completions/completions.js";
import {
  buildCreateParams,
} from "./convert.js";
import { consumeOpenAIStream } from "../openai-compatible/stream.js";

const GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

function extractReasoningDelta(chunk: ChatCompletionChunk): string | undefined {
  const choice = chunk.choices[0];
  if (!choice) {
    return undefined;
  }
  return (choice.delta as { reasoning_content?: string }).reasoning_content;
}

export const GLMEngine: LLMEngineCtor = class implements LLMEngine {
  private client: OpenAI;
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || GLM_BASE_URL,
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
        });
        const response = await consumeOpenAIStream(stream, {
          emitChunk: (chunk) => {
            controller.emitChunk(chunk);
          },
          extractReasoningDelta,
        });
        controller.resolve(response);
      } catch (error: unknown) {
        controller.reject(error);
      }
    })();
    return controller.handle;
  }
};

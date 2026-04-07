import Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool, LLMResponse, LLMStreamHandle } from "../../core/types.js";
import type { LLMEngine, LLMEngineCtor } from "../../core/llm.js";
import { createLLMStreamHandle } from "../../core/llm.js";
import type { ModelConfig } from "../../core/config.js";
import {
  buildCreateParams,
} from "./convert.js";
import { consumeAnthropicStream } from "./stream.js";

export const AnthropicEngine: LLMEngineCtor = class implements LLMEngine {
  private client: Anthropic;
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  streamGenerate(
    messages: Message[],
    tools: Tool[],
  ): LLMStreamHandle<LLMResponse> {
    const params = buildCreateParams(messages, this.config, tools);
    const controller = createLLMStreamHandle<LLMResponse>();
    void (async () => {
      try {
        const stream = await this.client.messages.create({
          ...params,
          stream: true,
        });
        const response = await consumeAnthropicStream(stream, {
          emitChunk: (chunk) => {
            controller.emitChunk(chunk);
          },
        });
        controller.resolve(response);
      } catch (error: unknown) {
        controller.reject(error);
      }
    })();
    return controller.handle;
  }
};

import OpenAI from "openai";
import type { Message, Tool } from "../../core/types.js";
import type { AssistMessage, ToolCallMessage } from "../../core/types.js";
import type { LLMEngine, LLMEngineCtor } from "../../core/llm.js";
import type { ModelConfig } from "../../core/config.js";
import {
  buildCreateParams,
  convertResponse,
} from "../openai-compatible/convert.js";

export const OpenAIEngine: LLMEngineCtor = class implements LLMEngine {
  private client: OpenAI;
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
    this.client = new OpenAI({ apiKey: config.apiKey });
  }

  async generate(
    messages: Message[],
    tools: Tool[],
  ): Promise<AssistMessage | ToolCallMessage[]> {
    const params = buildCreateParams(messages, this.config, tools);
    const response = await this.client.chat.completions.create(params);
    return convertResponse(response);
  }
};

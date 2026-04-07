import Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "../../core/types.js";
import type { AssistMessage, ToolCallMessage } from "../../core/types.js";
import type { LLMEngine, LLMEngineCtor } from "../../core/llm.js";
import type { ModelConfig } from "../../core/config.js";
import {
  buildCreateParams,
  convertResponse,
} from "./convert.js";

export const AnthropicEngine: LLMEngineCtor = class implements LLMEngine {
  private client: Anthropic;
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  async generate(
    messages: Message[],
    tools: Tool[],
  ): Promise<AssistMessage | ToolCallMessage[]> {
    const params = buildCreateParams(messages, this.config, tools);
    const response = await this.client.messages.create(params);
    return convertResponse(response);
  }
};

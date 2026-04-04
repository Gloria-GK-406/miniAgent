import Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "../../core/types.js";
import type { ModelConfig } from "../../core/config.js";
import type { AssistMessage, ToolCallMessage } from "../../core/types.js";
import type { LLMEngine } from "../../core/llm.js";
import { LLMEngineSchema } from "../../core/llm.js";
import {
  buildCreateParams,
  convertResponse,
} from "./convert.js";

export function createAnthropicEngine(): LLMEngine {
  const clients = new Map<string, Anthropic>();

  function getClient(config: ModelConfig): Anthropic {
    let client = clients.get(config.apiKey);
    if (!client) {
      client = new Anthropic({ apiKey: config.apiKey });
      clients.set(config.apiKey, client);
    }
    return client;
  }

  return LLMEngineSchema.parse({
    generate: async (
      messages: Message[],
      config: ModelConfig,
      tools: Tool[],
    ): Promise<AssistMessage | ToolCallMessage> => {
      const client = getClient(config);
      const params = buildCreateParams(messages, config, tools);
      const response = await client.messages.create(params);
      return convertResponse(response);
    },
  });
}

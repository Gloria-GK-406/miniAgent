import OpenAI from "openai";
import type { Message, Tool } from "../../core/types.js";
import type { ModelConfig } from "../../core/config.js";
import type { AssistMessage, ToolCallMessage } from "../../core/types.js";
import type { LLMEngine } from "../../core/llm.js";
import { LLMEngineSchema } from "../../core/llm.js";
import {
  buildCreateParams,
  convertResponse,
} from "./convert.js";

export function createOpenAICompatibleEngine(): LLMEngine {
  const clients = new Map<string, OpenAI>();

  function getClient(config: ModelConfig): OpenAI {
    const key = `${config.baseUrl}:${config.apiKey}`;
    let client = clients.get(key);
    if (!client) {
      client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || undefined,
      });
      clients.set(key, client);
    }
    return client;
  }

  return LLMEngineSchema.parse({
    generate: async (
      messages: Message[],
      config: ModelConfig,
      tools: Tool[],
    ): Promise<AssistMessage | ToolCallMessage[]> => {
      const client = getClient(config);
      const params = buildCreateParams(messages, config, tools);
      const response = await client.chat.completions.create(params);
      return convertResponse(response);
    },
  });
}

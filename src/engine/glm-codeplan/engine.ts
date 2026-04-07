import OpenAI from "openai";
import type { Message, Tool } from "../../core/types.js";
import type { AssistMessage, ToolCallMessage } from "../../core/types.js";
import type { LLMEngine, LLMEngineCtor } from "../../core/llm.js";
import type { ModelConfig } from "../../core/config.js";
import {
  buildCreateParams,
  convertResponse,
} from "../glm/convert.js";

const GLM_CODEPLAN_BASE_URL = "https://open.bigmodel.cn/api/coding/paas/v4";

export const GLMCodePlanEngine: LLMEngineCtor = class implements LLMEngine {
  private client: OpenAI;
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || GLM_CODEPLAN_BASE_URL,
    });
  }

  async generate(
    messages: Message[],
    tools: Tool[],
  ): Promise<AssistMessage | ToolCallMessage[]> {
    const params = buildCreateParams(messages, this.config, tools);
    const response = await this.client.chat.completions.create({
      ...params,
      stream: false,
    });
    return convertResponse(response);
  }
};

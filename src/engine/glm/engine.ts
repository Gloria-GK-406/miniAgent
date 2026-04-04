import type { Message, Tool } from "../../core/types.js";
import type { ModelConfig } from "../../core/config.js";
import type { AssistMessage, ToolCallMessage } from "../../core/types.js";
import type { LLMEngine } from "../../core/llm.js";
import { LLMEngineSchema } from "../../core/llm.js";
import { createOpenAICompatibleEngine } from "../openai-compatible/engine.js";

const GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

export function createGLMEngine(): LLMEngine {
  const base = createOpenAICompatibleEngine();

  return LLMEngineSchema.parse({
    generate: (
      messages: Message[],
      config: ModelConfig,
      tools: Tool[],
    ): Promise<AssistMessage | ToolCallMessage> =>
      base.generate(messages, { ...config, baseUrl: GLM_BASE_URL }, tools),
  });
}

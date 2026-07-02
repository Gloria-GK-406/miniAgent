import OpenAI from "openai";
import type { LLMEngine } from "../../core/llm.js";
import {
  type LLMGenerateRequest,
  type ModelPreset,
} from "../../core/config.js";
import type { MessageChunk } from "../../core/types.js";
import type {
  ChatCompletionChunk,
} from "openai/resources/chat/completions/completions.js";
import { buildCreateParamsFromRequest } from "./convert.js";
import { GLM_MODEL_PRESETS } from "./models.js";
import { streamOpenAIChunks } from "../openai-compatible/stream.js";

const GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

function extractReasoningDelta(chunk: ChatCompletionChunk): string | undefined {
  const choice = chunk.choices[0];
  if (!choice) {
    return undefined;
  }
  return (choice.delta as { reasoning_content?: string }).reasoning_content;
}

function cloneModelPresets(presets: ModelPreset[]): ModelPreset[] {
  return presets.map((model) => structuredClone(model));
}

export class GLMEngine implements LLMEngine {
  readonly name = "glm";

  getModels(): ModelPreset[] {
    return cloneModelPresets(GLM_MODEL_PRESETS);
  }

  async *streamGenerate(
    request: LLMGenerateRequest,
  ): AsyncGenerator<MessageChunk> {
    const client = new OpenAI({
      apiKey: request.provider.key,
      baseURL: request.provider.baseUrl ?? GLM_BASE_URL,
    });
    const stream = await client.chat.completions.create({
      ...buildCreateParamsFromRequest(request),
      stream: true,
      stream_options: {
        include_usage: true,
      },
    } as never) as unknown as AsyncIterable<ChatCompletionChunk>;

    yield* streamOpenAIChunks(stream, { extractReasoningDelta });
  }
}

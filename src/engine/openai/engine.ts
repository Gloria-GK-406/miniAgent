import OpenAI from "openai";
import type { LLMEngine } from "../../core/llm.js";
import {
  type LLMGenerateRequest,
  type ModelPreset,
} from "../../core/config.js";
import type { MessageChunk } from "../../core/types.js";
import { buildCreateParamsFromRequest } from "../openai-compatible/convert.js";
import { OPENAI_MODEL_PRESETS } from "./models.js";
import { streamOpenAIChunks } from "../openai-compatible/stream.js";

function cloneModelPresets(presets: ModelPreset[]): ModelPreset[] {
  return presets.map((model) => structuredClone(model));
}

export class OpenAIEngine implements LLMEngine {
  readonly name = "openai";

  getModels(): ModelPreset[] {
    return cloneModelPresets(OPENAI_MODEL_PRESETS);
  }

  async *streamGenerate(
    request: LLMGenerateRequest,
  ): AsyncGenerator<MessageChunk> {
    const client = new OpenAI({
      apiKey: request.provider.key,
      ...(request.provider.baseUrl !== undefined && {
        baseURL: request.provider.baseUrl,
      }),
    });
    const stream = await client.chat.completions.create({
      ...buildCreateParamsFromRequest(request),
      stream: true,
      stream_options: {
        include_usage: true,
      },
    });

    yield* streamOpenAIChunks(stream);
  }
}

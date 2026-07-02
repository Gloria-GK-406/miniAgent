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
import { buildCreateParamsFromRequest } from "../openai-compatible/convert.js";
import { NVIDIA_MODEL_PRESETS } from "./models.js";
import { streamNVIDIAChunks } from "./stream.js";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

function cloneModelPresets(presets: ModelPreset[]): ModelPreset[] {
  return presets.map((model) => structuredClone(model));
}

export class NVIDIAEngine implements LLMEngine {
  readonly name = "nvidia";

  getModels(): ModelPreset[] {
    return cloneModelPresets(NVIDIA_MODEL_PRESETS);
  }

  async *streamGenerate(
    request: LLMGenerateRequest,
  ): AsyncGenerator<MessageChunk> {
    const client = new OpenAI({
      apiKey: request.provider.key,
      baseURL: request.provider.baseUrl ?? NVIDIA_BASE_URL,
    });
    const stream = await client.chat.completions.create({
      ...buildCreateParamsFromRequest(request),
      stream: true,
      stream_options: {
        include_usage: true,
      },
    } as never) as unknown as AsyncIterable<ChatCompletionChunk>;

    yield* streamNVIDIAChunks(stream);
  }
}

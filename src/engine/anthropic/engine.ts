import Anthropic from "@anthropic-ai/sdk";
import type { LLMEngine } from "../../core/llm.js";
import {
  type LLMGenerateRequest,
  type ModelPreset,
} from "../../core/config.js";
import type { MessageChunk } from "../../core/types.js";
import { buildCreateParamsFromRequest } from "./convert.js";
import { ANTHROPIC_MODEL_PRESETS } from "./models.js";
import { streamAnthropicChunks } from "./stream.js";

function cloneModelPresets(presets: ModelPreset[]): ModelPreset[] {
  return presets.map((model) => structuredClone(model));
}

export class AnthropicEngine implements LLMEngine {
  readonly name = "anthropic";

  getModels(): ModelPreset[] {
    return cloneModelPresets(ANTHROPIC_MODEL_PRESETS);
  }

  async *streamGenerate(
    request: LLMGenerateRequest,
  ): AsyncGenerator<MessageChunk> {
    const client = new Anthropic({
      apiKey: request.provider.key,
      ...(request.provider.baseUrl !== undefined && {
        baseURL: request.provider.baseUrl,
      }),
    });
    const stream = await client.messages.create({
      ...buildCreateParamsFromRequest(request),
      stream: true,
    });

    yield* streamAnthropicChunks(stream);
  }
}

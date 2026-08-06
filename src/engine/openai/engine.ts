import OpenAI from "openai";
import type { LLMEngine } from "../../core/llm.js";
import type { LLMGenerateRequest } from "../../core/config.js";
import type { MessageChunk } from "../../core/types.js";
import { buildCreateParamsFromRequest } from "../openai-compatible/convert.js";
import { streamOpenAIChunks } from "../openai-compatible/stream.js";

export class OpenAIEngine implements LLMEngine {
  readonly name = "openai";

  async *streamGenerate(
    request: LLMGenerateRequest,
  ): AsyncGenerator<MessageChunk> {
    const client = new OpenAI({
      apiKey: request.runtime.key,
      ...(request.runtime.baseUrl !== undefined && {
        baseURL: request.runtime.baseUrl,
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

import Anthropic from "@anthropic-ai/sdk";
import type { LLMEngine } from "../../core/index.js";
import type { LLMGenerateRequest } from "../../core/index.js";
import type { MessageChunk } from "../../core/index.js";
import { buildCreateParamsFromRequest } from "./convert.js";
import { streamAnthropicChunks } from "./stream.js";

export class AnthropicEngine implements LLMEngine {
  readonly name = "anthropic";

  async *streamGenerate(
    request: LLMGenerateRequest,
  ): AsyncGenerator<MessageChunk> {
    const client = new Anthropic({
      apiKey: request.runtime.key,
      ...(request.runtime.baseUrl !== undefined && {
        baseURL: request.runtime.baseUrl,
      }),
    });
    const stream = await client.messages.create({
      ...buildCreateParamsFromRequest(request),
      stream: true,
    });

    yield* streamAnthropicChunks(stream);
  }
}

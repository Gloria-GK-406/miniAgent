import Anthropic from "@anthropic-ai/sdk";
import { createLLMStreamHandle, type LLMEngine, type ModelCatalogLLMEngine } from "../../core/llm.js";
import {
  type LLMGenerateRequest,
  type ModelConfig,
  type ModelPreset,
} from "../../core/config.js";
import { type Message, type Tool, type LLMResponse, type LLMStreamHandle } from "../../core/types.js";
import {
  buildCreateParams,
  buildCreateParamsFromRequest,
} from "./convert.js";
import { ANTHROPIC_MODEL_PRESETS } from "./models.js";
import { consumeAnthropicStream } from "./stream.js";

type CreateParams =
  | ReturnType<typeof buildCreateParams>
  | ReturnType<typeof buildCreateParamsFromRequest>;

function cloneModelPresets(presets: ModelPreset[]): ModelPreset[] {
  return presets.map((model) => ({
    ...model,
    thinkingLevels: [...model.thinkingLevels],
  }));
}

export class AnthropicEngine implements LLMEngine, ModelCatalogLLMEngine {
  readonly name = "anthropic";

  private client?: Anthropic;
  private config?: ModelConfig;

  constructor(config?: ModelConfig) {
    if (config) {
      this.config = config;
      this.client = new Anthropic({ apiKey: config.apiKey });
    }
  }

  getModels(): ModelPreset[] {
    return cloneModelPresets(ANTHROPIC_MODEL_PRESETS);
  }

  streamGenerate(request: LLMGenerateRequest): LLMStreamHandle<LLMResponse>;
  streamGenerate(
    messages: Message[],
    tools: Tool[],
  ): LLMStreamHandle<LLMResponse>;
  streamGenerate(
    requestOrMessages: LLMGenerateRequest | Message[],
    tools?: Tool[],
  ): LLMStreamHandle<LLMResponse> {
    if (Array.isArray(requestOrMessages)) {
      if (!this.config || !this.client || !tools) {
        throw new Error(
          "AnthropicEngine legacy streamGenerate requires constructor config",
        );
      }
      return this.streamWithClient(
        this.client,
        buildCreateParams(requestOrMessages, this.config, tools),
      );
    }

    const client = new Anthropic({ apiKey: requestOrMessages.provider.apiKey });
    return this.streamWithClient(
      client,
      buildCreateParamsFromRequest(requestOrMessages),
    );
  }

  private streamWithClient(
    client: Anthropic,
    params: CreateParams,
  ): LLMStreamHandle<LLMResponse> {
    const controller = createLLMStreamHandle<LLMResponse>();

    void (async () => {
      try {
        const stream = await client.messages.create({
          ...params,
          stream: true,
        });
        const response = await consumeAnthropicStream(stream, {
          emitChunk: (chunk) => {
            controller.emitChunk(chunk);
          },
          shouldBreak: () => controller.isAborted(),
        });
        controller.resolve(response);
      } catch (error: unknown) {
        controller.reject(error);
      }
    })();
    return controller.handle;
  }
}

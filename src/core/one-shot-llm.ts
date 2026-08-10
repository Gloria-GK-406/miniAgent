import { z } from "zod";
import type { GenerationConfig, ModelRuntime } from "./config.js";
import { createFunctionSchema } from "./function-schema.js";
import {
  collectLLMResponse,
  createLLMStreamHandle,
  type LLMStreamController,
} from "./llm.js";
import type { TokenUsageReporter } from "./token-usage.js";
import type {
  LLMRequest,
  LLMResponse,
  LLMStreamHandle,
  Message,
} from "./types.js";

export class OneShotLLM {
  private used = false;

  constructor(
    private readonly llm: LLMRequest,
    private readonly runtime: ModelRuntime,
    private readonly generation: GenerationConfig,
    private readonly tokenUsageReporter: TokenUsageReporter,
  ) {}

  invoke(messages: Message[]): LLMStreamHandle<LLMResponse> {
    if (this.used) {
      throw new Error("OneShotLLM can only be invoked once");
    }
    this.used = true;

    const controller = createLLMStreamHandle<LLMResponse>();
    void this.execute(messages, controller);
    return controller.handle;
  }

  private async execute(
    messages: Message[],
    controller: LLMStreamController<LLMResponse>,
  ): Promise<void> {
    try {
      const response = await collectLLMResponse(
        this.llm.streamInvoke({
          runtime: structuredClone(this.runtime),
          messages: structuredClone(messages),
          tools: [],
          generation: { ...this.generation },
        }),
        {
          onChunk: (chunk) => controller.emitChunk(chunk),
          onTokenUsage: (tokenCount) => {
            this.tokenUsageReporter.reportTokenUsage(tokenCount);
          },
          shouldStop: () => controller.isAborted(),
        },
      );
      controller.resolve(response);
    } catch (error: unknown) {
      controller.reject(error);
    }
  }
}

export const OneShotLLMSchema = z.custom<OneShotLLM>((value) => {
  return value instanceof OneShotLLM;
});

export const OneShotLLMFactorySchema = z.object({
  create: createFunctionSchema<() => OneShotLLM>(),
});

export type OneShotLLMFactory = z.infer<typeof OneShotLLMFactorySchema>;

export const OneShotLLMRequireSchema = z.object({
  setOneShotLLMFactory: createFunctionSchema<(
    factory: OneShotLLMFactory,
  ) => void>(),
});

export type OneShotLLMRequire = z.infer<typeof OneShotLLMRequireSchema>;

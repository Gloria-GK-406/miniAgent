import { z } from "zod";
import {
  MessageSchema,
  AssistMessageSchema,
  ToolCallMessageSchema,
  ToolSchema,
  LLMRequestSchema,
} from "./types.js";
import {
  ModelConfigSchema,
} from "./config.js";
import type {
  Message,
  Tool,
  LLMRequest,
} from "./types.js";
import type {
  ModelConfig,
} from "./config.js";

export const LLMEngineSchema = z.object({
  generate: z.function(
    z.tuple([z.array(MessageSchema), ModelConfigSchema, z.array(ToolSchema)]),
    z.promise(z.union([AssistMessageSchema, ToolCallMessageSchema])),
  ),
});

export type LLMEngine = z.infer<typeof LLMEngineSchema>;

export const LLMEngineRegisterSchema = z.object({
  register: z.function(
    z.tuple([z.string(), LLMEngineSchema]),
    z.void(),
  ),
  get: z.function(
    z.tuple([z.string()]),
    z.optional(LLMEngineSchema),
  ),
});

export type LLMEngineRegister = z.infer<typeof LLMEngineRegisterSchema>;

export class DefaultLLMEngineRegister implements LLMEngineRegister {
  private engines = new Map<string, LLMEngine>();

  register(provider: string, engine: LLMEngine): void {
    this.engines.set(provider, engine);
  }

  get(provider: string): LLMEngine | undefined {
    return this.engines.get(provider);
  }
}

export function createLLMRequest(register: LLMEngineRegister): LLMRequest {
  return LLMRequestSchema.parse({
    invoke: async (messages: Message[], config: ModelConfig, tools: Tool[]) => {
      const engine = register.get(config.provider);
      if (!engine) {
        throw new Error(`No LLM engine registered for provider: ${config.provider}`);
      }
      return engine.generate(messages, config, tools);
    },
  });
}

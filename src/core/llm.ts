import type {
  Message,
  Tool,
  LLMRequest,
  AssistMessage,
  ToolCallMessage,
} from "./types.js";
import type {
  ModelConfig,
} from "./config.js";
import { LRUCache } from "lru-cache";

export interface LLMEngine {
  generate(
    messages: Message[],
    tools: Tool[],
  ): Promise<AssistMessage | ToolCallMessage[]>;
}

export type LLMEngineCtor = new (config: ModelConfig) => LLMEngine;

export class LLMEngineManager implements LLMRequest {
  private ctors = new Map<string, LLMEngineCtor>();
  private cache = new LRUCache<ModelConfig, LLMEngine>({ max: 20 });

  register(provider: string, ctor: LLMEngineCtor): void {
    this.ctors.set(provider, ctor);
  }

  get(config: ModelConfig): LLMEngine {
    const cached = this.cache.get(config);
    if (cached) {
      return cached;
    }
    const Ctor = this.ctors.get(config.provider);
    if (!Ctor) {
      throw new Error(`No LLM engine registered for provider: ${config.provider}`);
    }
    const engine = new Ctor(config);
    this.cache.set(config, engine);
    return engine;
  }

  async invoke(
    messages: Message[],
    config: ModelConfig,
    tools: Tool[],
  ): Promise<AssistMessage | ToolCallMessage[]> {
    const engine = this.get(config);
    return engine.generate(messages, tools);
  }
}

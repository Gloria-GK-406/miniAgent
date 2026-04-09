import type {
  Message,
  Tool,
  LLMRequest,
  LLMResponse,
  TokenCount,
  LLMStreamChunk,
  LLMStreamHandle,
} from "./types.js";
import type {
  ModelConfig,
} from "./config.js";
import { LRUCache } from "lru-cache";

export interface LLMEngine {
  streamGenerate(
    messages: Message[],
    tools: Tool[],
  ): LLMStreamHandle<LLMResponse>;
}

export type LLMEngineCtor = new (config: ModelConfig) => LLMEngine;

class DeferredLLMStreamHandle<T> implements LLMStreamHandle<T> {
  private listeners = new Set<(chunk: LLMStreamChunk) => void>();
  private promise: Promise<T>;
  private resolvePromise!: (value: T) => void;
  private rejectPromise!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  onChunk(listener: (chunk: LLMStreamChunk) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitChunk(chunk: LLMStreamChunk): void {
    for (const listener of this.listeners) {
      listener(chunk);
    }
  }

  resolve(value: T): void {
    this.resolvePromise(value);
  }

  reject(reason?: unknown): void {
    this.rejectPromise(reason);
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }
}

export interface LLMStreamController<T> {
  handle: LLMStreamHandle<T>;
  emitChunk(chunk: LLMStreamChunk): void;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

export function createLLMStreamHandle<T>(): LLMStreamController<T> {
  const handle = new DeferredLLMStreamHandle<T>();
  return {
    handle,
    emitChunk(chunk: LLMStreamChunk): void {
      handle.emitChunk(chunk);
    },
    resolve(value: T): void {
      handle.resolve(value);
    },
    reject(reason?: unknown): void {
      handle.reject(reason);
    },
  };
}

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

  streamInvoke(
    messages: Message[],
    config: ModelConfig,
    tools: Tool[],
  ): LLMStreamHandle<LLMResponse> {
    const engine = this.get(config);
    return engine.streamGenerate(messages, tools);
  }
}

export function emptyTokenCount(): TokenCount {
  return {
    input: 0,
    output: 0,
    total: 0,
  };
}

export function createTokenCount(input: number, output: number): TokenCount {
  return {
    input,
    output,
    total: input + output,
  };
}

export function addTokenCount(left: TokenCount, right: TokenCount): TokenCount {
  return createTokenCount(left.input + right.input, left.output + right.output);
}

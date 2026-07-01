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
  LLMGenerateRequest,
  ModelConfig,
  ModelPreset,
} from "./config.js";
import { LRUCache } from "lru-cache";

export interface LLMEngine {
  readonly name?: string;
  getModels?(): ModelPreset[];
  streamGenerate:
    | ((request: LLMGenerateRequest) => LLMStreamHandle<LLMResponse>)
    | ((messages: Message[], tools: Tool[]) => LLMStreamHandle<LLMResponse>);
}

export interface RegisteredLLMEngine {
  readonly name: string;
  getModels(): ModelPreset[];
  streamGenerate(request: LLMGenerateRequest): LLMStreamHandle<LLMResponse>;
}

export type LegacyLLMEngine = {
  streamGenerate(messages: Message[], tools: Tool[]): LLMStreamHandle<LLMResponse>;
};

export type LLMEngineCtor = new (config: ModelConfig) => LegacyLLMEngine;

class DeferredLLMStreamHandle<T> implements LLMStreamHandle<T> {
  private listeners = new Set<(chunk: LLMStreamChunk) => void>();
  private promise: Promise<T>;
  private resolvePromise!: (value: T) => void;
  private rejectPromise!: (reason?: unknown) => void;
  private aborted = false;

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
    if (this.aborted) return;
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

  abort(): void {
    this.aborted = true;
  }

  isAborted(): boolean {
    return this.aborted;
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
  isAborted(): boolean;
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
    isAborted(): boolean {
      return handle.isAborted();
    },
  };
}

export class LLMEngineManager implements LLMRequest {
  private engines = new Map<string, RegisteredLLMEngine>();
  private legacyCtors = new Map<string, LLMEngineCtor>();
  private legacyCache = new LRUCache<ModelConfig, LegacyLLMEngine>({ max: 20 });

  register(engine: RegisteredLLMEngine): void;
  register(provider: string, ctor: LLMEngineCtor): void;
  register(providerOrEngine: string | RegisteredLLMEngine, ctor?: LLMEngineCtor): void {
    if (typeof providerOrEngine === "string") {
      if (!ctor) {
        throw new Error(`No LLM engine constructor provided for provider: ${providerOrEngine}`);
      }
      this.legacyCtors.set(providerOrEngine, ctor);
      return;
    }
    this.engines.set(providerOrEngine.name, providerOrEngine);
  }

  get(config: ModelConfig): LegacyLLMEngine {
    const cached = this.legacyCache.get(config);
    if (cached) {
      return cached;
    }
    const Ctor = this.legacyCtors.get(config.provider);
    if (!Ctor) {
      throw new Error(`No LLM engine registered for provider: ${config.provider}`);
    }
    const engine = new Ctor(config);
    this.legacyCache.set(config, engine);
    return engine;
  }

  getEngineModels(engineName: string): ModelPreset[] {
    const engine = this.engines.get(engineName);
    if (!engine) {
      return [];
    }
    return engine.getModels().map((model) => ({
      ...model,
      thinkingLevels: [...model.thinkingLevels],
    }));
  }

  streamInvoke(request: LLMGenerateRequest): LLMStreamHandle<LLMResponse>;
  streamInvoke(
    messages: Message[],
    config: ModelConfig,
    tools: Tool[],
  ): LLMStreamHandle<LLMResponse>;
  streamInvoke(
    requestOrMessages: LLMGenerateRequest | Message[],
    config?: ModelConfig,
    tools?: Tool[],
  ): LLMStreamHandle<LLMResponse> {
    if (Array.isArray(requestOrMessages)) {
      if (!config || !tools) {
        throw new Error("Legacy streamInvoke requires config and tools");
      }
      const engine = this.get(config);
      return engine.streamGenerate(requestOrMessages, tools);
    }

    const engine = this.engines.get(requestOrMessages.model.engine);
    if (!engine) {
      throw new Error(`No LLM engine registered for engine: ${requestOrMessages.model.engine}`);
    }
    return engine.streamGenerate(requestOrMessages);
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

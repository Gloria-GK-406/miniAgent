import type {
  LLMRequest,
  MessageChunk,
  TokenCount,
  LLMStreamChunk,
  LLMStreamHandle,
} from "./types.js";
import type {
  LLMGenerateRequest,
  ModelPreset,
  ResolvedModel,
} from "./config.js";
import { ThinkingLevel } from "./config.js";

export interface LLMEngine {
  readonly name: string;
  getModels(): ModelPreset[];
  streamGenerate(request: LLMGenerateRequest): AsyncGenerator<MessageChunk>;
}

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

function assertLLMEngine(engine: unknown): asserts engine is LLMEngine {
  if (typeof engine !== "object" || engine === null) {
    throw new Error("Expected an LLM engine instance");
  }

  const candidate = engine as {
    name?: unknown;
    getModels?: unknown;
    streamGenerate?: unknown;
  };

  if (typeof candidate.name !== "string" || candidate.name.trim() === "") {
    throw new Error("Expected an LLM engine instance with a non-empty name");
  }
  if (typeof candidate.getModels !== "function") {
    throw new Error("Expected an LLM engine instance with getModels()");
  }
  if (typeof candidate.streamGenerate !== "function") {
    throw new Error("Expected an LLM engine instance with streamGenerate()");
  }
}

function resolveModel(engineName: string, model: ModelPreset): ResolvedModel {
  return {
    id: model.id,
    provider: engineName,
    name: model.name,
    ...(model.displayName !== undefined && { displayName: model.displayName }),
    ...(model.contextSize !== undefined && { contextSize: model.contextSize }),
    ...(model.maxOutputTokens !== undefined && { maxOutputTokens: model.maxOutputTokens }),
    thinkingLevels: [...(model.thinkingLevels ?? [ThinkingLevel.None])],
    ...(model.capabilities !== undefined && { capabilities: structuredClone(model.capabilities) }),
    ...(model.metadata !== undefined && { metadata: structuredClone(model.metadata) }),
  };
}

export class LLMEngineManager implements LLMRequest {
  private engines = new Map<string, LLMEngine>();

  register(engine: LLMEngine): void {
    assertLLMEngine(engine);
    if (this.engines.has(engine.name)) {
      throw new Error(`LLM engine already registered: ${engine.name}`);
    }
    this.engines.set(engine.name, engine);
  }

  getEngineModels(engineName: string): ResolvedModel[] {
    const engine = this.engines.get(engineName);
    if (!engine) {
      return [];
    }
    return engine.getModels().map((model) => resolveModel(engine.name, model));
  }

  streamInvoke(request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
    const engine = this.engines.get(request.model.provider);
    if (!engine) {
      throw new Error(`No LLM engine registered for provider: ${request.model.provider}`);
    }
    return engine.streamGenerate(request);
  }
}

export class DefaultLLMEngineRegister extends LLMEngineManager {}

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

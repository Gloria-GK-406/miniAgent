import { z } from "zod";
import { createFunctionSchema } from "./function-schema.js";
import type {
  LLMResponse,
  LLMRequest,
  MessageChunk,
  TokenCount,
  LLMStreamChunk,
  LLMStreamHandle,
} from "./types.js";
import {
  createLLMStreamHandleSchema,
  LLMStreamChunkType,
  MessageType,
} from "./types.js";
import { type LLMGenerateRequest } from "./config.js";

export const LLMEngineSchema = z.object({
  name: z.string(),
  streamGenerate: createFunctionSchema<(
    request: LLMGenerateRequest,
  ) => AsyncGenerator<MessageChunk>>(),
});

export type LLMEngine = z.infer<typeof LLMEngineSchema>;

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

export function createLLMStreamControllerSchema<T>() {
  return z.object({
    handle: createLLMStreamHandleSchema<T>(),
    emitChunk: createFunctionSchema<(chunk: LLMStreamChunk) => void>(),
    resolve: createFunctionSchema<(value: T) => void>(),
    reject: createFunctionSchema<(reason?: unknown) => void>(),
    isAborted: createFunctionSchema<() => boolean>(),
  });
}

export type LLMStreamController<T> = z.infer<ReturnType<
  typeof createLLMStreamControllerSchema<T>
>>;

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
    streamGenerate?: unknown;
  };

  if (typeof candidate.name !== "string" || candidate.name.trim() === "") {
    throw new Error("Expected an LLM engine instance with a non-empty name");
  }
  if (typeof candidate.streamGenerate !== "function") {
    throw new Error("Expected an LLM engine instance with streamGenerate()");
  }
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

  streamInvoke(request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
    const engine = this.engines.get(request.runtime.provider);
    if (!engine) {
      throw new Error(`No LLM engine registered for provider: ${request.runtime.provider}`);
    }
    return engine.streamGenerate(request);
  }
}

export class DefaultLLMEngineRegister extends LLMEngineManager {}

interface ToolCallBuffer {
  id?: string;
  name?: string;
  argumentsText: string;
}

export const CollectLLMResponseOptionsSchema = z.object({
  onChunk: createFunctionSchema<(chunk: LLMStreamChunk) => void>().optional(),
  onTokenUsage: createFunctionSchema<(tokenCount: TokenCount) => void>().optional(),
  shouldStop: createFunctionSchema<() => boolean>().optional(),
});

export type CollectLLMResponseOptions = z.infer<typeof CollectLLMResponseOptionsSchema>;

function getToolCallBuffer(buffers: ToolCallBuffer[], index: number): ToolCallBuffer {
  const existing = buffers[index];
  if (existing) return existing;
  const created: ToolCallBuffer = { argumentsText: "" };
  buffers[index] = created;
  return created;
}

export async function collectLLMResponse(
  stream: AsyncGenerator<MessageChunk>,
  options: CollectLLMResponseOptions = {},
): Promise<LLMResponse> {
  let content = "";
  let reasoningContent = "";
  let tokenCount = emptyTokenCount();
  let hasTokenUsage = false;
  let interrupted = false;
  const toolCalls: ToolCallBuffer[] = [];

  for await (const chunk of stream) {
    options.onChunk?.(chunk);
    switch (chunk.type) {
      case LLMStreamChunkType.TextDelta:
        content += chunk.text;
        break;
      case LLMStreamChunkType.ReasoningDelta:
        reasoningContent += chunk.text;
        break;
      case LLMStreamChunkType.ToolCallArgumentsDelta: {
        const buffer = getToolCallBuffer(toolCalls, chunk.index);
        buffer.argumentsText += chunk.argsText;
        if (chunk.toolCallId !== undefined) buffer.id = chunk.toolCallId;
        if (chunk.toolName !== undefined) buffer.name = chunk.toolName;
        break;
      }
      case LLMStreamChunkType.Usage:
        tokenCount = { ...chunk.tokenCount };
        hasTokenUsage = true;
        break;
    }
    if (options.shouldStop?.()) {
      interrupted = true;
      await stream.return?.(undefined);
      break;
    }
  }

  let response: LLMResponse;
  if (toolCalls.length > 0) {
    response = {
      message: toolCalls.map((toolCall) => {
        if (!toolCall.id) throw new Error("LLM stream ended without a tool call id");
        if (!toolCall.name) throw new Error("LLM stream ended without a tool name");
        const argumentsObject = toolCall.argumentsText.trim() === ""
          ? {}
          : JSON.parse(toolCall.argumentsText) as Record<string, unknown>;
        return {
          id: crypto.randomUUID(),
          type: MessageType.ToolCall,
          content,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          arguments: argumentsObject,
          ...(reasoningContent !== "" && { reasoningContent }),
        };
      }),
      tokenCount,
    };
  } else {
    response = {
      message: {
        id: crypto.randomUUID(),
        type: MessageType.Assist,
        content,
        ...(reasoningContent !== "" && { reasoningContent }),
      },
      tokenCount,
    };
  }

  if (hasTokenUsage && !interrupted && !options.shouldStop?.()) {
    options.onTokenUsage?.({ ...tokenCount });
  }
  return response;
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

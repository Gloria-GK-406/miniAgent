import { z } from "zod";
import type { GenerationConfig, LLMGenerateRequest, ModelRuntime } from "./config.js";
import type { Store } from "../store/store.js";

export enum MessageType {
  System = "system",
  User = "user",
  Assist = "assist",
  ToolCall = "toolcall",
  ToolResult = "toolresult",
}

export const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const ImageContentSchema = z.object({
  type: z.literal("image"),
  mediaType: z.string(),
  data: z.string(),
});

export const MessageContentSchema = z.union([
  z.string(),
  TextContentSchema,
  ImageContentSchema,
]);

export const BaseMessageSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(MessageType),
  content: MessageContentSchema,
});

export const SystemMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.System),
});

export const UserMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.User),
});

export const AssistMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.Assist),
  reasoningContent: z.string().optional(),
});

export const ToolCallMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.ToolCall),
  toolCallId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.unknown()),
  reasoningContent: z.string().optional(),
});

export const ToolResultMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.ToolResult),
  toolCallId: z.string(),
});

export const MessageSchema = z.union([
  SystemMessageSchema,
  UserMessageSchema,
  AssistMessageSchema,
  ToolCallMessageSchema,
  ToolResultMessageSchema,
]);

export type BaseMessage = z.infer<typeof BaseMessageSchema>;
export type TextContent = z.infer<typeof TextContentSchema>;
export type ImageContent = z.infer<typeof ImageContentSchema>;
export type MessageContent = z.infer<typeof MessageContentSchema>;
export type SystemMessage = z.infer<typeof SystemMessageSchema>;
export type UserMessage = z.infer<typeof UserMessageSchema>;
export type AssistMessage = z.infer<typeof AssistMessageSchema>;
export type ToolCallMessage = z.infer<typeof ToolCallMessageSchema>;
export type ToolResultMessage = z.infer<typeof ToolResultMessageSchema>;
export type Message = z.infer<typeof MessageSchema>;

export const LLMMessageResponseSchema = z.union([
  AssistMessageSchema,
  z.array(ToolCallMessageSchema),
]);

export type LLMMessageResponse = z.infer<typeof LLMMessageResponseSchema>;

export const TokenCountSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type TokenCount = z.infer<typeof TokenCountSchema>;

export const LLMResponseSchema = z.object({
  message: LLMMessageResponseSchema,
  tokenCount: TokenCountSchema,
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;

export type { Tool } from "../tool/types.js";

export enum LLMStreamChunkType {
  TextDelta = "text-delta",
  ReasoningDelta = "reasoning-delta",
  ToolCallArgumentsDelta = "tool-call-arguments-delta",
}

export const TextDeltaChunkSchema = z.object({
  type: z.literal(LLMStreamChunkType.TextDelta),
  text: z.string(),
});

export const ReasoningDeltaChunkSchema = z.object({
  type: z.literal(LLMStreamChunkType.ReasoningDelta),
  text: z.string(),
});

export const ToolCallArgumentsDeltaChunkSchema = z.object({
  type: z.literal(LLMStreamChunkType.ToolCallArgumentsDelta),
  index: z.number().int().nonnegative(),
  argsText: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
});

export const LLMStreamChunkSchema = z.union([
  TextDeltaChunkSchema,
  ReasoningDeltaChunkSchema,
  ToolCallArgumentsDeltaChunkSchema,
]);

export type TextDeltaChunk = z.infer<typeof TextDeltaChunkSchema>;
export type ReasoningDeltaChunk = z.infer<typeof ReasoningDeltaChunkSchema>;
export type ToolCallArgumentsDeltaChunk = z.infer<typeof ToolCallArgumentsDeltaChunkSchema>;
export type LLMStreamChunk = z.infer<typeof LLMStreamChunkSchema>;
export type MessageChunk = LLMStreamChunk;

export interface LLMStreamHandle<T> extends PromiseLike<T> {
  onChunk(listener: (chunk: LLMStreamChunk) => void): () => void;
  abort(): void;
}

export const LLMStreamHandleSchema = z.custom<LLMStreamHandle<LLMResponse>>();

export interface LLMRequest {
  streamInvoke(request: LLMGenerateRequest): AsyncGenerator<MessageChunk>;
}

export const LLMRequestSchema = z.custom<LLMRequest>((value) => {
  return (
    typeof value === "object" &&
    value !== null &&
    "streamInvoke" in value &&
    typeof (value as { streamInvoke?: unknown }).streamInvoke === "function"
  );
});

export const AgentRuntimeAccessSchema = z.object({
  getModelRuntime: z.function(
    z.tuple([]),
    z.custom<ModelRuntime>().optional(),
  ),
  getGenerationConfig: z.function(
    z.tuple([]),
    z.custom<GenerationConfig>(),
  ),
});

export type AgentRuntimeAccess = z.infer<typeof AgentRuntimeAccessSchema>;

export const AgentRuntimeRequireSchema = z.object({
  setAgentRuntimeAccess: z.function(
    z.tuple([AgentRuntimeAccessSchema]),
    z.void(),
  ),
});

export type AgentRuntimeRequire = z.infer<typeof AgentRuntimeRequireSchema>;

export const ContextProviderSchema = z.object({
  priority: z.number().int(),
  collect: z.function(
    z.tuple([]),
    z.promise(z.array(MessageSchema)),
  ),
});

export type ContextProvider = z.infer<typeof ContextProviderSchema>;

export const TurnContextSchema = z.object({
  turn: z.number().int().positive(),
  context: z.array(MessageSchema),
});

export type TurnContext = z.infer<typeof TurnContextSchema>;

export const TurnContextConsumerSchema = z.object({
  consumeTurnContext: z.function(
    z.tuple([TurnContextSchema]),
    z.promise(z.void()),
  ),
});

export type TurnContextConsumer = z.infer<typeof TurnContextConsumerSchema>;

export const TurnContextAppenderSchema = z.object({
  appendTurnContext: z.function(
    z.tuple([]),
    z.promise(z.array(MessageSchema)),
  ),
});

export type TurnContextAppender = z.infer<typeof TurnContextAppenderSchema>;

export enum ActionType {
  Delete = "delete",
  Replace = "replace",
  AddFirst = "addfirst",
  AddLast = "addlast",
}

export const DeleteActionSchema = z.object({
  type: z.literal(ActionType.Delete),
  targetId: z.string(),
});

export const ReplaceActionSchema = z.object({
  type: z.literal(ActionType.Replace),
  targetId: z.string(),
  message: MessageSchema,
});

export const AddFirstActionSchema = z.object({
  type: z.literal(ActionType.AddFirst),
  message: MessageSchema,
});

export const AddLastActionSchema = z.object({
  type: z.literal(ActionType.AddLast),
  message: MessageSchema,
});

export const ActionSchema = z.union([
  DeleteActionSchema,
  ReplaceActionSchema,
  AddFirstActionSchema,
  AddLastActionSchema,
]);

export type Action = z.infer<typeof ActionSchema>;

export const ContextProcessorSchema = z.object({
  priority: z.number().int(),
  process: z.function(
    z.tuple([z.array(MessageSchema)]),
    z.promise(z.array(ActionSchema)),
  ),
});

export type ContextProcessor = z.infer<typeof ContextProcessorSchema>;

export const MessageNotifierSchema = z.object({
  notify: z.function(
    z.tuple([MessageSchema]),
    z.promise(z.void()),
  ),
});

export type MessageNotifier = z.infer<typeof MessageNotifierSchema>;

export const ErrorHandlerSchema = z.object({
  priority: z.number().int(),
  canHandle: z.function(
    z.tuple([z.unknown()]),
    z.boolean(),
  ),
  handle: z.function(
    z.tuple([z.unknown()]),
    z.promise(z.void()),
  ),
});

export type ErrorHandler = z.infer<typeof ErrorHandlerSchema>;

export const AgentContextControlSchema = z.object({
  getMessages: z.function(
    z.tuple([]),
    z.promise(z.array(MessageSchema)),
  ),
  getMessage: z.function(
    z.tuple([z.string()]),
    z.promise(MessageSchema.optional()),
  ),
  previewContext: z.function(
    z.tuple([]),
    z.promise(z.array(MessageSchema)),
  ),
  setDiscardBefore: z.function(
    z.tuple([z.string()]),
    z.promise(z.void()),
  ),
  clearDiscardBefore: z.function(
    z.tuple([]),
    z.promise(z.void()),
  ),
});

export type AgentContextControl = z.infer<typeof AgentContextControlSchema>;

export const AfterTurnProcessorSchema = z.object({
  priority: z.number().int(),
  process: z.function(
    z.tuple([AgentContextControlSchema, MessageSchema]),
    z.promise(z.void()),
  ),
});

export type AfterTurnProcessor = z.infer<typeof AfterTurnProcessorSchema>;

export const PersistRequireSchema = z.object({
  setStore: z.function(
    z.tuple([z.custom<Store>()]),
    z.promise(z.void()),
  ),
});

export type PersistRequire = z.infer<typeof PersistRequireSchema>;

export const LLMRequireSchema = z.object({
  setLLMRequest: z.function(
    z.tuple([LLMRequestSchema]),
    z.promise(z.void()),
  ),
});

export type LLMRequire = z.infer<typeof LLMRequireSchema>;

export const DestroyableSchema = z.object({
  destroy: z.function(
    z.tuple([]),
    z.union([z.void(), z.promise(z.void())]),
  ),
});

export type Destroyable = z.infer<typeof DestroyableSchema>;

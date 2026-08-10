import { z } from "zod";
import { createFunctionSchema } from "./function-schema.js";
import type { LLMGenerateRequest } from "./config.js";
import {
  AssistMessageSchema,
  MessageSchema,
  ToolCallMessageSchema,
  type Message,
} from "./message.js";
export {
  AssistMessageSchema,
  BaseMessageSchema,
  ImageContentSchema,
  MessageContentSchema,
  MessageSchema,
  MessageType,
  SystemMessageSchema,
  TextContentSchema,
  ToolCallMessageSchema,
  ToolResultMessageSchema,
  UserMessageSchema,
} from "./message.js";
export type {
  AssistMessage,
  BaseMessage,
  ImageContent,
  Message,
  MessageContent,
  SystemMessage,
  TextContent,
  ToolCallMessage,
  ToolResultMessage,
  UserMessage,
} from "./message.js";

export const LLMMessageResponseSchema = z.union([
  AssistMessageSchema,
  z.array(ToolCallMessageSchema),
]);

export type LLMMessageResponse = z.infer<typeof LLMMessageResponseSchema>;

export const TokenCountSchema = z.object({
  input: z.int().nonnegative(),
  output: z.int().nonnegative(),
  total: z.int().nonnegative(),
});

export type TokenCount = z.infer<typeof TokenCountSchema>;

export const LLMResponseSchema = z.object({
  message: LLMMessageResponseSchema,
  tokenCount: TokenCountSchema,
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;

export type { Tool } from "./tool.js";

export const LLMStreamChunkType = {
  TextDelta: "text-delta",
  ReasoningDelta: "reasoning-delta",
  ToolCallArgumentsDelta: "tool-call-arguments-delta",
  Usage: "usage",
} as const;

export const LLMStreamChunkTypeSchema = z.enum(LLMStreamChunkType);

export type LLMStreamChunkType = z.infer<typeof LLMStreamChunkTypeSchema>;

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
  index: z.int().nonnegative(),
  argsText: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
});

export const UsageChunkSchema = z.object({
  type: z.literal(LLMStreamChunkType.Usage),
  tokenCount: TokenCountSchema,
});

export const LLMStreamChunkSchema = z.union([
  TextDeltaChunkSchema,
  ReasoningDeltaChunkSchema,
  ToolCallArgumentsDeltaChunkSchema,
  UsageChunkSchema,
]);

export type TextDeltaChunk = z.infer<typeof TextDeltaChunkSchema>;
export type ReasoningDeltaChunk = z.infer<typeof ReasoningDeltaChunkSchema>;
export type ToolCallArgumentsDeltaChunk = z.infer<typeof ToolCallArgumentsDeltaChunkSchema>;
export type UsageChunk = z.infer<typeof UsageChunkSchema>;
export type LLMStreamChunk = z.infer<typeof LLMStreamChunkSchema>;
export type MessageChunk = z.infer<typeof LLMStreamChunkSchema>;

export function createLLMStreamHandleSchema<T>() {
  return z.object({
    onChunk: createFunctionSchema<(
      listener: (chunk: LLMStreamChunk) => void,
    ) => () => void>(),
    abort: createFunctionSchema<() => void>(),
    then: createFunctionSchema<PromiseLike<T>["then"]>(),
  });
}

export type LLMStreamHandle<T> = z.infer<ReturnType<typeof createLLMStreamHandleSchema<T>>>;

export const LLMStreamHandleSchema = createLLMStreamHandleSchema<LLMResponse>();

export const LLMRequestSchema = z.object({
  streamInvoke: createFunctionSchema<(
    request: LLMGenerateRequest,
  ) => AsyncGenerator<MessageChunk>>(),
});

export type LLMRequest = z.infer<typeof LLMRequestSchema>;

export const ContextProviderSchema = z.object({
  priority: z.int(),
  collect: createFunctionSchema<() => Promise<Message[]>>(),
});

export type ContextProvider = z.infer<typeof ContextProviderSchema>;

export const TurnContextSchema = z.object({
  turn: z.int().positive(),
  context: z.array(MessageSchema),
});

export type TurnContext = z.infer<typeof TurnContextSchema>;

export const TurnContextConsumerSchema = z.object({
  consumeTurnContext: createFunctionSchema<(
    context: TurnContext,
  ) => Promise<void>>(),
});

export type TurnContextConsumer = z.infer<typeof TurnContextConsumerSchema>;

export const TurnContextAppenderSchema = z.object({
  appendTurnContext: createFunctionSchema<() => Promise<Message[]>>(),
});

export type TurnContextAppender = z.infer<typeof TurnContextAppenderSchema>;

export const ActionType = {
  Delete: "delete",
  Replace: "replace",
  AddFirst: "addfirst",
  AddLast: "addlast",
} as const;

export const ActionTypeSchema = z.enum(ActionType);

export type ActionType = z.infer<typeof ActionTypeSchema>;

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
  priority: z.int(),
  process: createFunctionSchema<(
    messages: Message[],
  ) => Promise<Action[]>>(),
});

export type ContextProcessor = z.infer<typeof ContextProcessorSchema>;

export const MessageNotifierSchema = z.object({
  notify: createFunctionSchema<(message: Message) => Promise<void>>(),
});

export type MessageNotifier = z.infer<typeof MessageNotifierSchema>;

export const ErrorHandlerSchema = z.object({
  priority: z.int(),
  canHandle: createFunctionSchema<(error: unknown) => boolean>(),
  handle: createFunctionSchema<(error: unknown) => Promise<void>>(),
});

export type ErrorHandler = z.infer<typeof ErrorHandlerSchema>;

export const AgentContextControlSchema = z.object({
  getMessages: createFunctionSchema<() => Promise<Message[]>>(),
  getMessage: createFunctionSchema<(
    messageId: string,
  ) => Promise<Message | undefined>>(),
  previewContext: createFunctionSchema<() => Promise<Message[]>>(),
  setDiscardBefore: createFunctionSchema<(
    messageId: string,
  ) => Promise<void>>(),
  clearDiscardBefore: createFunctionSchema<() => Promise<void>>(),
});

export type AgentContextControl = z.infer<typeof AgentContextControlSchema>;

export const AfterTurnProcessorSchema = z.object({
  priority: z.int(),
  process: createFunctionSchema<(
    control: AgentContextControl,
    message: Message,
  ) => Promise<void>>(),
});

export type AfterTurnProcessor = z.infer<typeof AfterTurnProcessorSchema>;

export const LLMRequireSchema = z.object({
  setLLMRequest: createFunctionSchema<(
    request: LLMRequest,
  ) => Promise<void>>(),
});

export type LLMRequire = z.infer<typeof LLMRequireSchema>;

export const DestroyableSchema = z.object({
  destroy: createFunctionSchema<() => void | Promise<void>>(),
});

export type Destroyable = z.infer<typeof DestroyableSchema>;

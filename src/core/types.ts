import { z } from "zod";
import { ModelConfigSchema } from "./config.js";
import { ToolSchema } from "../tool/types.js";

export enum MessageType {
  System = "system",
  User = "user",
  Assist = "assist",
  ToolCall = "toolcall",
  ToolResult = "toolresult",
  Finish = "finish",
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

export const FinishMessageSchema = BaseMessageSchema.extend({
  type: z.literal(MessageType.Finish),
});

export const MessageSchema = z.union([
  SystemMessageSchema,
  UserMessageSchema,
  AssistMessageSchema,
  ToolCallMessageSchema,
  ToolResultMessageSchema,
  FinishMessageSchema,
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
export type FinishMessage = z.infer<typeof FinishMessageSchema>;
export type Message = z.infer<typeof MessageSchema>;

export type { ModelConfig } from "./config.js";

export type { Tool } from "../tool/types.js";

export const LLMRequestSchema = z.object({
  invoke: z.function(
    z.tuple([z.array(MessageSchema), ModelConfigSchema, z.array(ToolSchema)]),
    z.promise(z.union([AssistMessageSchema, z.array(ToolCallMessageSchema)])),
  ),
});

export type LLMRequest = z.infer<typeof LLMRequestSchema>;

export const ToolRegistrySchema = z.object({
  register: z.function(
    z.tuple([ToolSchema]),
    z.void(),
  ),
  execute: z.function(
    z.tuple([ToolCallMessageSchema]),
    z.promise(z.union([ToolResultMessageSchema, FinishMessageSchema])),
  ),
});

export type ToolRegistry = z.infer<typeof ToolRegistrySchema>;

export const ContextProviderSchema = z.object({
  priority: z.number().int(),
  collect: z.function(
    z.tuple([]),
    z.promise(z.array(MessageSchema)),
  ),
});

export type ContextProvider = z.infer<typeof ContextProviderSchema>;

export const ContextProviderRegistrySchema = z.object({
  register: z.function(
    z.tuple([ContextProviderSchema]),
    z.void(),
  ),
});

export type ContextProviderRegistry = z.infer<typeof ContextProviderRegistrySchema>;

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

export const ContextProcessorRegistrySchema = z.object({
  register: z.function(
    z.tuple([ContextProcessorSchema]),
    z.void(),
  ),
});

export type ContextProcessorRegistry = z.infer<typeof ContextProcessorRegistrySchema>;

export const MessageNotifierSchema = z.object({
  notify: z.function(
    z.tuple([MessageSchema]),
    z.promise(z.void()),
  ),
});

export type MessageNotifier = z.infer<typeof MessageNotifierSchema>;

export const MessageNotifierRegistrySchema = z.object({
  register: z.function(
    z.tuple([MessageNotifierSchema]),
    z.void(),
  ),
});

export type MessageNotifierRegistry = z.infer<typeof MessageNotifierRegistrySchema>;

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

export const ErrorHandlerRegistrySchema = z.object({
  register: z.function(
    z.tuple([ErrorHandlerSchema]),
    z.void(),
  ),
});

export type ErrorHandlerRegistry = z.infer<typeof ErrorHandlerRegistrySchema>;

export const AfterTurnProcessorSchema = z.object({
  priority: z.number().int(),
  process: z.function(
    z.tuple([z.unknown(), MessageSchema]),
    z.promise(z.void()),
  ),
});

export type AfterTurnProcessor = z.infer<typeof AfterTurnProcessorSchema>;

export const AfterTurnProcessorRegistrySchema = z.object({
  register: z.function(
    z.tuple([AfterTurnProcessorSchema]),
    z.void(),
  ),
});

export type AfterTurnProcessorRegistry = z.infer<typeof AfterTurnProcessorRegistrySchema>;

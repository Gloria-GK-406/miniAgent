import { z } from "zod";

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
    type: z.enum(MessageType),
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
    arguments: z.record(z.string(), z.unknown()),
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

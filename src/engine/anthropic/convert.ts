import type Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  ToolCallMessage,
  ToolResultMessage,
  Tool,
  ImageContent,
  LLMMessageResponse,
  LLMResponse,
} from "../../core/types.js";
import {
  ThinkingLevel,
  type LLMGenerateRequest,
  type ModelConfig,
} from "../../core/config.js";
import type {
  MessageParam,
  ContentBlockParam,
  Tool as AnthropicTool,
} from "@anthropic-ai/sdk/resources/messages/messages.js";
import { MessageType } from "../../core/types.js";
import { createTokenCount } from "../../core/llm.js";
import { zodToJsonSchema } from "zod-to-json-schema";

interface ConvertedInput {
  system?: string;
  messages: MessageParam[];
}

function extractText(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (content.type === "text") return content.text;
  return "";
}

export function convertMessages(messages: Message[]): ConvertedInput {
  const systemParts: string[] = [];
  const params: MessageParam[] = [];

  for (const msg of messages) {
    switch (msg.type) {
      case MessageType.System:
        systemParts.push(extractText(msg.content));
        break;
      case MessageType.User:
        params.push(convertUserMessage(msg.content));
        break;
      case MessageType.Assist:
        params.push({
          role: "assistant",
          content: [{ type: "text", text: extractText(msg.content) }],
        });
        break;
      case MessageType.ToolCall:
        params.push(convertToolCallMessage(msg));
        break;
      case MessageType.ToolResult:
        params.push(convertToolResultMessage(msg));
        break;
    }
  }

  const merged = mergeToolResults(params);

  const result: ConvertedInput = { messages: merged };
  if (systemParts.length > 0) {
    result.system = systemParts.join("\n\n");
  }
  return result;
}

function convertUserMessage(content: Message["content"]): MessageParam {
  if (typeof content !== "string" && content.type === "image") {
    const img = content as ImageContent;
    return {
      role: "user",
      content: [
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type:
              img.mediaType as
                | "image/jpeg"
                | "image/png"
                | "image/gif"
                | "image/webp",
            data: img.data,
          },
        },
      ],
    };
  }
  return { role: "user", content: extractText(content) };
}

function convertToolCallMessage(msg: ToolCallMessage): MessageParam {
  const text = extractText(msg.content);
  return {
    role: "assistant",
    content: [
      ...(text ? [{ type: "text" as const, text }] : []),
      {
        type: "tool_use" as const,
        id: msg.toolCallId,
        name: msg.toolName,
        input: msg.arguments as Record<string, unknown>,
      },
    ],
  };
}

function convertToolResultMessage(msg: ToolResultMessage): MessageParam {
  return {
    role: "user",
    content: [
      {
        type: "tool_result" as const,
        tool_use_id: msg.toolCallId,
        content: extractText(msg.content),
      },
    ],
  };
}

function mergeToolResults(messages: MessageParam[]): MessageParam[] {
  const result: MessageParam[] = [];

  for (const msg of messages) {
    const last = result[result.length - 1];
    if (
      last &&
      last.role === "user" &&
      msg.role === "user" &&
      Array.isArray(last.content) &&
      Array.isArray(msg.content)
    ) {
      (last.content as ContentBlockParam[]).push(
        ...(msg.content as ContentBlockParam[]),
      );
      continue;
    }
    result.push(msg);
  }

  return result;
}

export function convertTools(tools: Tool[]): AnthropicTool[] {
  if (tools.length === 0) return [];

  return tools.map((tool): AnthropicTool => {
    const jsonSchema = zodToJsonSchema(tool.parameters);
    const { $schema: _, ...schema } = jsonSchema as Record<string, unknown>;
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: "object",
        ...(schema["properties"] !== undefined && {
          properties: schema["properties"],
        }),
        ...(schema["required"] !== undefined && {
          required: schema["required"] as string[],
        }),
      },
    };
  });
}

export function buildCreateParams(
  messages: Message[],
  config: ModelConfig,
  tools: Tool[],
): Anthropic.MessageCreateParamsNonStreaming {
  const { system, messages: convertedMessages } = convertMessages(messages);

  return {
    model: config.model,
    max_tokens: config.maxTokens ?? config.maxOutputTokens ?? 4096,
    ...(system !== undefined && { system }),
    messages: convertedMessages,
    ...(convertTools(tools).length > 0 && { tools: convertTools(tools) }),
    ...(config.temperature !== undefined && {
      temperature: config.temperature,
    }),
    ...(config.topP !== undefined && { top_p: config.topP }),
  };
}

type AnthropicEffort = "low" | "medium" | "high" | "max";

const ORDERED_THINKING_LEVELS = [
  ThinkingLevel.Low,
  ThinkingLevel.Medium,
  ThinkingLevel.High,
  ThinkingLevel.Max,
] as const;

function selectSupportedThinkingLevel(
  requested: ThinkingLevel,
  supportedLevels: ThinkingLevel[],
): ThinkingLevel | undefined {
  if (requested === ThinkingLevel.None) {
    return undefined;
  }
  const supportedNonNone = ORDERED_THINKING_LEVELS.filter((level) =>
    supportedLevels.includes(level),
  );
  if (supportedNonNone.length === 0) {
    return undefined;
  }
  if (supportedNonNone.includes(requested)) {
    return requested;
  }

  const requestedIndex = ORDERED_THINKING_LEVELS.indexOf(requested);
  let nearest = supportedNonNone[0]!;
  let nearestDistance = Math.abs(
    ORDERED_THINKING_LEVELS.indexOf(nearest) - requestedIndex,
  );
  for (const level of supportedNonNone.slice(1)) {
    const distance = Math.abs(
      ORDERED_THINKING_LEVELS.indexOf(level) - requestedIndex,
    );
    if (distance < nearestDistance) {
      nearest = level;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function mapAnthropicEffort(level: ThinkingLevel): AnthropicEffort {
  switch (level) {
    case ThinkingLevel.Low:
      return "low";
    case ThinkingLevel.Medium:
      return "medium";
    case ThinkingLevel.High:
      return "high";
    case ThinkingLevel.Max:
      return "max";
    case ThinkingLevel.None:
      return "low";
  }
}

export function buildCreateParamsFromRequest(
  request: LLMGenerateRequest,
): Anthropic.MessageCreateParamsNonStreaming {
  const config: ModelConfig = {
    provider: request.model.engine,
    model: request.model.model,
    apiKey: request.provider.apiKey,
    ...(request.generation.maxOutputTokens !== undefined && {
      maxOutputTokens: request.generation.maxOutputTokens,
    }),
    temperature: request.generation.temperature,
    ...(request.generation.topP !== undefined && { topP: request.generation.topP }),
  };
  const params = buildCreateParams(request.messages, config, request.tools);
  const effectiveThinking = selectSupportedThinkingLevel(
    request.generation.thinking,
    request.model.thinkingLevels,
  );

  if (effectiveThinking === undefined) {
    return params;
  }
  return {
    ...params,
    output_config: {
      effort: mapAnthropicEffort(effectiveThinking),
    },
  };
}

export function convertResponse(
  response: Anthropic.Message,
): LLMResponse {
  const textParts: string[] = [];
  const toolUses: {
    id: string;
    name: string;
    input: unknown;
  }[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      textParts.push(block.text);
    } else if (block.type === "tool_use") {
      toolUses.push({ id: block.id, name: block.name, input: block.input });
    }
  }

  let converted: LLMMessageResponse;
  if (toolUses.length > 0) {
    const text = textParts.join("");
    converted = toolUses.map((tu) => ({
      id: crypto.randomUUID(),
      type: MessageType.ToolCall,
      content: text,
      toolCallId: tu.id,
      toolName: tu.name,
      arguments: (tu.input as Record<string, unknown>) ?? {},
    }));
  } else {
    converted = {
      id: crypto.randomUUID(),
      type: MessageType.Assist,
      content: textParts.join(""),
    };
  }

  return {
    message: converted,
    tokenCount: createTokenCount(
      (response.usage.input_tokens ?? 0)
        + (response.usage.cache_creation_input_tokens ?? 0)
        + (response.usage.cache_read_input_tokens ?? 0),
      response.usage.output_tokens,
    ),
  };
}

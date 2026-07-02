import { Box, Text } from "ink";
import type { Message, MessageContent } from "../../core/types.js";
import { MessageType } from "../../core/types.js";

export interface RenderLine {
  key: string;
  text: string;
  color?: string;
  dimColor?: boolean;
}

interface MessageListProps {
  messages: Message[];
  streamingText?: string;
  reasoningText?: string;
  width?: number;
  showReasoning?: boolean;
  showToolDetails?: boolean;
}

export interface MessageRenderOptions {
  showReasoning?: boolean;
  showToolDetails?: boolean;
}

function getContentText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (content.type === "text") return content.text;
  return "[image]";
}

function charWidth(char: string): number {
  const code = char.codePointAt(0);
  if (code === undefined) {
    return 0;
  }
  if (
    code >= 0x1100
    && (
      code <= 0x115f
      || code === 0x2329
      || code === 0x232a
      || (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f)
      || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe10 && code <= 0xfe19)
      || (code >= 0xfe30 && code <= 0xfe6f)
      || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6)
      || (code >= 0x1f300 && code <= 0x1f64f)
      || (code >= 0x1f900 && code <= 0x1f9ff)
      || (code >= 0x20000 && code <= 0x3fffd)
    )
  ) {
    return 2;
  }
  return 1;
}

function wrapLine(text: string, width: number): string[] {
  if (width <= 0) {
    return [text];
  }
  if (text === "") {
    return [""];
  }

  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;

  for (const char of text) {
    const nextWidth = charWidth(char);
    if (current !== "" && currentWidth + nextWidth > width) {
      lines.push(current);
      current = char;
      currentWidth = nextWidth;
      continue;
    }
    current += char;
    currentWidth += nextWidth;
  }

  if (current !== "") {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function wrapBlock(
  text: string,
  width: number,
  options: {
    firstPrefix?: string;
    restPrefix?: string;
  } = {},
): string[] {
  const rawLines = text === "" ? [""] : text.split("\n");
  const rendered: string[] = [];

  rawLines.forEach((rawLine, index) => {
    const prefix = index === 0 ? (options.firstPrefix ?? "") : (options.restPrefix ?? "");
    const continuationPrefix = options.restPrefix ?? "";
    const contentWidth = Math.max(1, width - Array.from(prefix).reduce((sum, char) => sum + charWidth(char), 0));
    const wrapped = wrapLine(rawLine, contentWidth);
    wrapped.forEach((line, wrappedIndex) => {
      rendered.push(`${wrappedIndex === 0 ? prefix : continuationPrefix}${line}`);
    });
  });

  return rendered;
}

function truncatePreview(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function summarizeToolResult(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  return truncatePreview(firstLine, 120);
}

export function buildRenderableMessages(
  messages: Message[],
  streamingText?: string,
  reasoningText?: string,
  options: MessageRenderOptions = {},
): Message[] {
  const lastMessage = messages[messages.length - 1];
  const showReasoning = options.showReasoning ?? false;
  const shouldRenderStreamingTail = lastMessage?.type !== MessageType.Assist
    && (
      (streamingText?.length ?? 0) > 0
      || (showReasoning && (reasoningText?.length ?? 0) > 0)
    );

  if (!shouldRenderStreamingTail) {
    return messages;
  }

  return [
    ...messages,
    {
      id: "__streaming_tail__",
      type: MessageType.Assist,
      content: "",
    },
  ];
}

function messageToLines(
  message: Message,
  width: number,
  options: {
    streamingText?: string;
    reasoningText?: string;
    showReasoning?: boolean;
    showToolDetails?: boolean;
  } = {},
): RenderLine[] {
  switch (message.type) {
    case MessageType.User:
      return wrapBlock(getContentText(message.content), width, {
        firstPrefix: "> ",
        restPrefix: "  ",
      }).map((text, index) => ({
        key: `${message.id}:user:${index}`,
        text,
        color: "green",
      }));

    case MessageType.Assist: {
      const contentText = getContentText(message.content) + (options.streamingText ?? "");
      const lines: RenderLine[] = wrapBlock(contentText, width).map((text, index) => ({
        key: `${message.id}:assist:${index}`,
        text,
        color: "cyan",
      }));

      const reasoning = (options.showReasoning ?? false) ? [
        ...(message.reasoningContent ? wrapBlock(message.reasoningContent, width, {
          firstPrefix: "? ",
          restPrefix: "  ",
        }) : []),
        ...(options.reasoningText ? wrapBlock(options.reasoningText, width, {
          firstPrefix: "? ",
          restPrefix: "  ",
        }) : []),
      ] : [];

      return [
        ...lines,
        ...reasoning.map((text, index) => ({
          key: `${message.id}:reason:${index}`,
          text,
          dimColor: true,
        })),
      ];
    }

    case MessageType.ToolCall: {
      const lines: RenderLine[] = [];
      const content = getContentText(message.content);
      if (content !== "") {
        lines.push(
          ...wrapBlock(content, width).map((text, index) => ({
            key: `${message.id}:toolcall-content:${index}`,
            text,
            color: "cyan",
          })),
        );
      }
      const argText = options.showToolDetails === true
        ? ` ${JSON.stringify(message.arguments)}`
        : "";
      lines.push(
        ...wrapBlock(`${message.toolName}${argText}`, width, {
          firstPrefix: "$ ",
          restPrefix: "  ",
        }).map((text, index) => ({
          key: `${message.id}:toolcall:${index}`,
          text,
          color: "yellow",
        })),
      );
      return lines;
    }

    case MessageType.ToolResult: {
      const resultText = getContentText(message.content);
      const renderedText = options.showToolDetails === true
        ? resultText
        : summarizeToolResult(resultText);
      return wrapBlock(renderedText, width, {
        firstPrefix: "< ",
        restPrefix: "  ",
      }).map((text, index) => ({
        key: `${message.id}:toolresult:${index}`,
        text,
        dimColor: true,
      }));
    }

    case MessageType.System:
      return wrapBlock(getContentText(message.content), width).map((text, index) => ({
        key: `${message.id}:system:${index}`,
        text,
        color: "magenta",
      }));
  }
}

export function buildRenderableLines(
  messages: Message[],
  streamingText: string | undefined,
  reasoningText: string | undefined,
  width: number,
  options: MessageRenderOptions = {},
): RenderLine[] {
  const renderableMessages = buildRenderableMessages(
    messages,
    streamingText,
    reasoningText,
    options,
  );

  return renderableMessages.flatMap((message, index) => {
    const isLast = index === renderableMessages.length - 1;
    const isAssist = message.type === MessageType.Assist;
    return messageToLines(message, width, {
      ...(isLast && isAssist && streamingText !== undefined && { streamingText }),
      ...(isLast && isAssist && reasoningText !== undefined && { reasoningText }),
      showReasoning: options.showReasoning ?? false,
      showToolDetails: options.showToolDetails ?? false,
    });
  });
}

export function MessageList({
  messages,
  streamingText,
  reasoningText,
  width = 80,
  showReasoning = false,
  showToolDetails = false,
}: MessageListProps) {
  const lines = buildRenderableLines(
    messages,
    streamingText,
    reasoningText,
    width,
    { showReasoning, showToolDetails },
  );

  return (
    <Box flexDirection="column">
      {lines.map((line) => (
        <Text
          key={line.key}
          {...(line.color !== undefined && { color: line.color })}
          {...(line.dimColor === true && { dimColor: true })}
        >
          {line.text}
        </Text>
      ))}
    </Box>
  );
}

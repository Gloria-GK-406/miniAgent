import { Box, Text } from "ink";
import type { Message, MessageContent } from "../../core/types.js";
import { MessageType } from "../../core/types.js";

interface MessageItemProps {
  message: Message;
  streamingText?: string;
  reasoningText?: string;
  collapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
}

function getContentText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (content.type === "text") return content.text;
  return "[image]";
}

export function MessageItem({
  message,
  streamingText,
  reasoningText,
  collapsed = true,
}: MessageItemProps) {
  switch (message.type) {
    case MessageType.User:
      return (
        <Box>
          <Text color="green">&gt; </Text>
          <Text>{getContentText(message.content)}</Text>
        </Box>
      );
    case MessageType.Assist: {
      const text = getContentText(message.content);
      return (
        <Box flexDirection="column">
          <Text color="cyan">
            {text}
            {streamingText ?? ""}
          </Text>
          {message.reasoningContent && (
            <Text dimColor>{message.reasoningContent}</Text>
          )}
          {reasoningText && <Text dimColor>{reasoningText}</Text>}
        </Box>
      );
    }
    case MessageType.ToolCall: {
      const argsText = collapsed
        ? ""
        : `(${JSON.stringify(message.arguments)})`;
      return (
        <Text color="yellow">
          $ {message.toolName}
          {argsText}
        </Text>
      );
    }
    case MessageType.ToolResult: {
      const fullText = getContentText(message.content);
      const displayText = collapsed
        ? (fullText.split("\n")[0] ?? "")
        : fullText;
      return <Text dimColor>&lt; {displayText}</Text>;
    }
    case MessageType.System:
      return (
        <Text color="magenta">{getContentText(message.content)}</Text>
      );
  }
}

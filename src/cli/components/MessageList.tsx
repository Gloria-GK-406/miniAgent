import { Box } from "ink";
import type { Message } from "../../core/types.js";
import { MessageType } from "../../core/types.js";
import { MessageItem } from "./MessageItem.js";

interface MessageListProps {
  messages: Message[];
  streamingText?: string;
  reasoningText?: string;
}

export function MessageList({
  messages,
  streamingText,
  reasoningText,
}: MessageListProps) {
  return (
    <Box flexDirection="column">
      {messages.map((message, index) => {
        const isLast = index === messages.length - 1;
        const isAssist = message.type === MessageType.Assist;
        const showStreaming = isLast && isAssist ? streamingText : undefined;
        const showReasoning = isLast && isAssist ? reasoningText : undefined;
        return (
          <MessageItem
            key={message.id}
            message={message}
            {...(showStreaming !== undefined && { streamingText: showStreaming })}
            {...(showReasoning !== undefined && { reasoningText: showReasoning })}
          />
        );
      })}
    </Box>
  );
}

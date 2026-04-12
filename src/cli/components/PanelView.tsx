import { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { Message, MessageContent, ToolCallMessage } from "../../core/types.js";
import { MessageType } from "../../core/types.js";

export interface PanelData {
  title: string;
  messages: Message[];
}

interface PanelViewProps {
  data: PanelData;
  onClose: () => void;
}

function getContentText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (content.type === "text") return content.text;
  return "[image]";
}

function formatMessageLine(msg: Message): string {
  if (msg.type === MessageType.ToolCall) {
    const tc = msg as ToolCallMessage;
    return `${tc.toolName}(${JSON.stringify(tc.arguments).slice(0, 80)})`;
  }
  const text = getContentText(msg.content);
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

const TYPE_COLORS: Record<string, string> = {
  [MessageType.System]: "magenta",
  [MessageType.User]: "green",
  [MessageType.Assist]: "cyan",
  [MessageType.ToolCall]: "yellow",
  [MessageType.ToolResult]: "gray",
};

export function PanelView({ data, onClose }: PanelViewProps) {
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;
  const headerLines = 2;
  const footerLines = 2;
  const contentHeight = Math.max(1, terminalHeight - headerLines - footerLines);

  const [scrollOffset, setScrollOffset] = useState(0);
  const maxOffset = Math.max(0, data.messages.length - contentHeight);
  const clampedOffset = Math.min(scrollOffset, maxOffset);

  const visibleMessages = data.messages.slice(
    clampedOffset,
    clampedOffset + contentHeight,
  );

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + 1));
    }
    if (key.pageUp || (key.ctrl && _input === "u")) {
      setScrollOffset((prev) => Math.max(0, prev - contentHeight));
    }
    if (key.pageDown || (key.ctrl && _input === "d")) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + contentHeight));
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">
          {data.title}
        </Text>
        <Text> ({data.messages.length} messages)</Text>
      </Box>
      <Text dimColor>────────────────────────────────────────</Text>
      <Box flexDirection="column" height={contentHeight}>
        {visibleMessages.map((msg, i) => {
          const color = TYPE_COLORS[msg.type] ?? "white";
          const label = msg.type.padEnd(12);
          const content = formatMessageLine(msg);
          return (
            <Text key={clampedOffset + i}>
              <Text color={color}>{label}</Text>
              <Text> {content}</Text>
            </Text>
          );
        })}
      </Box>
      <Text dimColor>────────────────────────────────────────</Text>
      <Box justifyContent="space-between">
        <Text dimColor>
          {clampedOffset > 0 ? "↑ more above" : ""}
          {clampedOffset > 0 && clampedOffset < maxOffset ? " · " : ""}
          {clampedOffset < maxOffset ? "↓ more below" : ""}
        </Text>
        <Text dimColor>
          ESC close · ↑↓ scroll · PgUp/PgDn page
        </Text>
      </Box>
    </Box>
  );
}

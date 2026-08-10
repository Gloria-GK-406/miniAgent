import { z } from "zod";
import { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";

export const DiffLineKindSchema = z.enum(["add", "remove", "hunk", "file", "context"]);
export type DiffLineKind = z.infer<typeof DiffLineKindSchema>;

export const DiffWindowSchema = z.object({
  visibleLines: z.array(z.string()),
  maxOffset: z.number(),
  scrollOffset: z.number(),
}) as z.ZodType<{
  visibleLines: string[];
  maxOffset: number;
  scrollOffset: number;
}>;
export type DiffWindow = z.infer<typeof DiffWindowSchema>;

export const DiffViewPropsSchema = z.custom<{
  title: string;
  content: string;
  onClose: () => void;
}>();
export type DiffViewProps = z.infer<typeof DiffViewPropsSchema>;

export function classifyDiffLine(line: string): DiffLineKind {
  if (
    line.startsWith("diff --git ") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ")
  ) {
    return "file";
  }
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "remove";
  return "context";
}

export function getDiffWindow(
  lines: string[],
  contentHeight: number,
  scrollOffset: number,
): DiffWindow {
  const visibleHeight = Math.max(1, contentHeight);
  const maxOffset = Math.max(0, lines.length - visibleHeight);
  const clampedOffset = Math.min(Math.max(0, scrollOffset), maxOffset);

  return {
    visibleLines: lines.slice(clampedOffset, clampedOffset + visibleHeight),
    maxOffset,
    scrollOffset: clampedOffset,
  };
}

function splitContent(content: string): string[] {
  if (content.length === 0) return [];
  return content.replace(/\r\n/g, "\n").split("\n");
}

function trimToWidth(line: string, width: number): string {
  if (line.length <= width) return line;
  if (width <= 3) return line.slice(0, Math.max(0, width));
  return `${line.slice(0, width - 3)}...`;
}

function renderDiffLine(line: string, index: number, width: number) {
  const visibleText = trimToWidth(line.length > 0 ? line : " ", width);
  const key = `${index}:${line}`;
  const kind = classifyDiffLine(line);

  if (kind === "add") {
    return <Text key={key} color="green">{visibleText}</Text>;
  }
  if (kind === "remove") {
    return <Text key={key} color="red">{visibleText}</Text>;
  }
  if (kind === "hunk") {
    return <Text key={key} color="cyan">{visibleText}</Text>;
  }
  if (kind === "file") {
    return <Text key={key} color="yellow">{visibleText}</Text>;
  }
  return <Text key={key} dimColor={line.trim().length === 0}>{visibleText}</Text>;
}

export function DiffView({ title, content, onClose }: DiffViewProps) {
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;
  const terminalWidth = stdout?.columns ?? 80;
  const headerLines = 2;
  const footerLines = 2;
  const contentHeight = Math.max(1, terminalHeight - headerLines - footerLines);
  const contentWidth = Math.max(10, terminalWidth - 1);

  const lines = splitContent(content);
  const [scrollOffset, setScrollOffset] = useState(0);
  const {
    visibleLines,
    maxOffset,
    scrollOffset: clampedOffset,
  } = getDiffWindow(lines, contentHeight, scrollOffset);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + 1));
      return;
    }
    if (key.pageUp || (key.ctrl && _input === "u")) {
      setScrollOffset((prev) => Math.max(0, prev - contentHeight));
      return;
    }
    if (key.pageDown || (key.ctrl && _input === "d")) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + contentHeight));
      return;
    }
    if (key.home) {
      setScrollOffset(0);
      return;
    }
    if (key.end) {
      setScrollOffset(maxOffset);
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">{title}</Text>
        <Text dimColor> ({lines.length} lines)</Text>
      </Box>
      <Text dimColor>{"-".repeat(Math.min(72, contentWidth))}</Text>
      <Box flexDirection="column" height={contentHeight} overflow="hidden">
        {lines.length === 0 ? (
          <Text dimColor>No content</Text>
        ) : (
          visibleLines.map((line, index) => (
            renderDiffLine(line, clampedOffset + index, contentWidth)
          ))
        )}
      </Box>
      <Text dimColor>{"-".repeat(Math.min(72, contentWidth))}</Text>
      <Box justifyContent="space-between">
        <Text dimColor>
          {clampedOffset > 0 ? "more above" : ""}
          {clampedOffset > 0 && clampedOffset < maxOffset ? " | " : ""}
          {clampedOffset < maxOffset ? "more below" : ""}
        </Text>
        <Text dimColor>ESC close | Up/Down scroll | PgUp/PgDn page</Text>
      </Box>
    </Box>
  );
}

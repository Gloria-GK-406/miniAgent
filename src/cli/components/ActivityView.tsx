import { z } from "zod";
import { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { CLIActivityEntrySchema, type CLIActivityEntry } from "../runtime/types.js";

export const ActivityWindowSchema = z.object({
  visibleEntries: z.array(z.lazy(() => CLIActivityEntrySchema)),
  maxOffset: z.number(),
  scrollOffset: z.number(),
}) as z.ZodType<{
  visibleEntries: CLIActivityEntry[];
  maxOffset: number;
  scrollOffset: number;
}>;
export type ActivityWindow = z.infer<typeof ActivityWindowSchema>;

export const ActivityViewPropsSchema = z.custom<{
  entries: CLIActivityEntry[];
  onClose: () => void;
}>();
export type ActivityViewProps = z.infer<typeof ActivityViewPropsSchema>;

export function getActivityWindow(
  entries: CLIActivityEntry[],
  contentHeight: number,
  scrollOffset: number,
): ActivityWindow {
  const visibleHeight = Math.max(1, contentHeight);
  const maxOffset = Math.max(0, entries.length - visibleHeight);
  const clampedOffset = Math.min(Math.max(0, scrollOffset), maxOffset);
  return {
    visibleEntries: entries.slice(clampedOffset, clampedOffset + visibleHeight),
    maxOffset,
    scrollOffset: clampedOffset,
  };
}

function statusColor(status: CLIActivityEntry["status"]): string {
  if (status === "running") return "yellow";
  if (status === "error") return "red";
  return "green";
}

function kindLabel(kind: CLIActivityEntry["kind"]): string {
  if (kind === "subagent") return "AGENT";
  if (kind === "approval") return "APPROVAL";
  return "TOOL";
}

function statusLabel(status: CLIActivityEntry["status"]): string {
  return status.toUpperCase();
}

export function ActivityView({ entries, onClose }: ActivityViewProps) {
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;
  const headerLines = 2;
  const footerLines = 2;
  const contentHeight = Math.max(1, terminalHeight - headerLines - footerLines);
  const [scrollOffset, setScrollOffset] = useState(0);
  const {
    visibleEntries,
    maxOffset,
    scrollOffset: clampedOffset,
  } = getActivityWindow(entries, contentHeight, scrollOffset);

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
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Activity ({entries.length})</Text>
      <Text dimColor>{"-".repeat(72)}</Text>
      <Box flexDirection="column" height={contentHeight} overflow="hidden">
        {entries.length === 0 ? (
          <Text dimColor>No activity yet</Text>
        ) : (
          visibleEntries.map((entry) => (
            <Box key={entry.id} flexDirection="column">
              <Text>
                <Text color={statusColor(entry.status)}>{statusLabel(entry.status)}</Text>
                <Text> {kindLabel(entry.kind)} {entry.name}</Text>
              </Text>
              <Text dimColor>{entry.summary}</Text>
            </Box>
          ))
        )}
      </Box>
      <Text dimColor>{"-".repeat(72)}</Text>
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

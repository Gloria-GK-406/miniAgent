import { useEffect, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";

interface ModelSelectViewProps {
  modelPaths: string[];
  currentModelPath: string;
  onSelect: (path: string) => Promise<void> | void;
  onClose: () => void;
}

export function ModelSelectView({
  modelPaths,
  currentModelPath,
  onSelect,
  onClose,
}: ModelSelectViewProps) {
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;
  const headerLines = 2;
  const footerLines = 3;
  const contentHeight = Math.max(1, terminalHeight - headerLines - footerLines);

  const initialIndex = Math.max(0, modelPaths.indexOf(currentModelPath));
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [scrollOffset, setScrollOffset] = useState(
    Math.max(0, initialIndex - Math.floor(contentHeight / 2)),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxIndex = Math.max(0, modelPaths.length - 1);
  const maxOffset = Math.max(0, modelPaths.length - contentHeight);
  const clampedIndex = Math.min(selectedIndex, maxIndex);
  const clampedOffset = Math.min(scrollOffset, maxOffset);

  useEffect(() => {
    setSelectedIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    if (clampedIndex < clampedOffset) {
      setScrollOffset(clampedIndex);
      return;
    }
    if (clampedIndex >= clampedOffset + contentHeight) {
      setScrollOffset(clampedIndex - contentHeight + 1);
    }
  }, [clampedIndex, clampedOffset, contentHeight]);

  const visibleModels = modelPaths.slice(
    clampedOffset,
    clampedOffset + contentHeight,
  );

  useInput((_input, key) => {
    if (key.escape) {
      if (!isSubmitting) {
        onClose();
      }
      return;
    }

    if (isSubmitting) {
      return;
    }

    if (key.upArrow) {
      setError(null);
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setError(null);
      setSelectedIndex((prev) => Math.min(maxIndex, prev + 1));
      return;
    }

    if (key.return) {
      const nextModel = modelPaths[clampedIndex];
      if (nextModel === undefined) {
        return;
      }
      setError(null);
      setIsSubmitting(true);
      void Promise.resolve(onSelect(nextModel))
        .then(() => {
          setIsSubmitting(false);
          onClose();
        })
        .catch((cause: unknown) => {
          setIsSubmitting(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    }
  });

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">
          Models
        </Text>
        <Text> ({modelPaths.length})</Text>
      </Box>
      <Text dimColor>────────────────────────────────────────</Text>
      <Box flexDirection="column" height={contentHeight}>
        {visibleModels.map((path, index) => {
          const absoluteIndex = clampedOffset + index;
          const isSelected = absoluteIndex === clampedIndex;
          const isActive = path === currentModelPath;

          return (
            <Text
              key={path}
              bold={isSelected}
              inverse={isSelected}
              dimColor={!isSelected && !isActive}
              {...(isActive && { color: "green" })}
            >
              {isSelected ? "› " : "  "}
              {path}
              {isActive ? "  (active)" : ""}
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
        <Text dimColor>{isSubmitting ? "Switching..." : "Enter switch · ESC close"}</Text>
      </Box>
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}

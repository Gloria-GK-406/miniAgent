import { Box, Text } from "ink";
import Spinner from "ink-spinner";

interface StatusIndicatorProps {
  isRunning: boolean;
  currentTool: string | null;
  turnCount: number;
  error: string | null;
}

export function StatusIndicator({
  isRunning,
  currentTool,
  turnCount,
  error,
}: StatusIndicatorProps) {
  return (
    <Box gap={1}>
      {isRunning ? (
        <>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text>
            {currentTool ? `Executing ${currentTool}...` : "Thinking..."}
          </Text>
        </>
      ) : error ? (
        <Text color="red">Error: {error}</Text>
      ) : (
        <Text dimColor>Ready</Text>
      )}
      <Text dimColor>Turn {turnCount}</Text>
    </Box>
  );
}

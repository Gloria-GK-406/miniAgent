import { Box, Text } from "ink";

interface StatusBarProps {
  modelName: string;
  sessionName?: string;
  hitlEnabled: boolean;
  tokenUsage: { input: number; output: number; total: number };
}

function formatTokenCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

export function StatusBar({
  modelName,
  sessionName,
  hitlEnabled,
  tokenUsage,
}: StatusBarProps) {
  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      flexDirection="row"
      justifyContent="space-between"
      paddingX={1}
    >
      <Text bold color="cyan">
        {modelName}
      </Text>
      <Box gap={1}>
        {sessionName && <Text>{sessionName}</Text>}
        <Text color={hitlEnabled ? "green" : "gray"}>HITL</Text>
      </Box>
      <Text dimColor>
        {formatTokenCount(tokenUsage.input)} in /{" "}
        {formatTokenCount(tokenUsage.output)} out /{" "}
        {formatTokenCount(tokenUsage.total)} total
      </Text>
    </Box>
  );
}

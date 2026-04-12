import { Box, Text, useInput } from "ink";

interface ApprovalPromptProps {
  toolName: string;
  args: Record<string, unknown>;
  onDecision: (decision: boolean) => void;
}

export function ApprovalPrompt({ toolName, args, onDecision }: ApprovalPromptProps) {
  const argsStr = JSON.stringify(args, null, 2);
  const display = argsStr.length > 500 ? `${argsStr.slice(0, 497)}...` : argsStr;

  useInput((input) => {
    const key = input.toLowerCase();
    if (key === "y") onDecision(true);
    else if (key === "n") onDecision(false);
  });

  return (
    <Box flexDirection="column">
      <Text color="yellow">[HITL] Tool call: </Text>
      <Text bold>{toolName}</Text>
      <Text dimColor>{display}</Text>
      <Text color="yellow">Approve? [y]es / [n]o: </Text>
    </Box>
  );
}

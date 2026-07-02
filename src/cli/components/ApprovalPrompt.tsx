import { Box, Text, useInput } from "ink";

interface ApprovalPromptProps {
  toolName: string;
  args: Record<string, unknown>;
  onDecision: (decision: boolean) => void;
}

export function ApprovalPrompt({ toolName, args, onDecision }: ApprovalPromptProps) {
  const argsStr = JSON.stringify(args, null, 2);
  const display = argsStr.length > 500 ? `${argsStr.slice(0, 497)}...` : argsStr;

  useInput((input, keypress) => {
    if (keypress.return) {
      onDecision(true);
      return;
    }
    if (keypress.escape) {
      onDecision(false);
      return;
    }
    const key = input.toLowerCase();
    if (key === "y") onDecision(true);
    else if (key === "n") onDecision(false);
  });

  return (
    <Box borderStyle="single" borderColor="yellow" flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Approval required</Text>
      <Text>
        Tool: <Text bold>{toolName}</Text>
      </Text>
      <Text dimColor>{display}</Text>
      <Text color="yellow">Approve? [y]es / [n]o / Enter yes / Esc no</Text>
    </Box>
  );
}

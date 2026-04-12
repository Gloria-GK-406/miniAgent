import { Box, Text, useInput } from "ink";
import type { ApprovalDecision } from "../../tool/approver.js";

interface ApprovalPromptProps {
  toolName: string;
  args: Record<string, unknown>;
  onDecision: (decision: ApprovalDecision) => void;
}

export function ApprovalPrompt({ toolName, args, onDecision }: ApprovalPromptProps) {
  const argsStr = JSON.stringify(args, null, 2);
  const display = argsStr.length > 500 ? `${argsStr.slice(0, 497)}...` : argsStr;

  useInput((input) => {
    const key = input.toLowerCase();
    if (key === "y") onDecision("approve");
    else if (key === "n") onDecision("deny");
    else if (key === "a") onDecision("approve_all");
  });

  return (
    <Box flexDirection="column">
      <Text color="yellow">[HITL] Tool call: </Text>
      <Text bold>{toolName}</Text>
      <Text dimColor>{display}</Text>
      <Text color="yellow">Approve? [y]es / [n]o / [a]lways: </Text>
    </Box>
  );
}

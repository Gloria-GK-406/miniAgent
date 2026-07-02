import { Box, Text, useInput } from "ink";
import type { CLIApprovalDecision } from "../runtime/types.js";

interface ApprovalPromptProps {
  toolName: string;
  args: Record<string, unknown>;
  onDecision: (decision: CLIApprovalDecision) => void;
}

export function ApprovalPrompt({ toolName, args, onDecision }: ApprovalPromptProps) {
  const argsStr = JSON.stringify(args, null, 2);
  const display = argsStr.length > 500 ? `${argsStr.slice(0, 497)}...` : argsStr;

  useInput((input, keypress) => {
    if (keypress.return) {
      onDecision("allow");
      return;
    }
    if (keypress.escape) {
      onDecision("deny");
      return;
    }
    const key = input.toLowerCase();
    if (key === "y") onDecision("allow");
    else if (key === "n") onDecision("deny");
    else if (key === "a") onDecision("allow-session");
    else if (key === "d") onDecision("deny-session");
  });

  return (
    <Box borderStyle="single" borderColor="yellow" flexDirection="column" paddingX={1}>
      <Text bold color="yellow">Approval required</Text>
      <Text>
        Tool: <Text bold>{toolName}</Text>
      </Text>
      <Text dimColor>{display}</Text>
      <Text color="yellow">
        Approve? [y]es / [a]lways same request / [n]o / [d]eny session same request / Enter yes / Esc no
      </Text>
    </Box>
  );
}

import { z } from "zod";
import { Box, Text, useInput, useStdout } from "ink";

export const SystemPromptViewPropsSchema = z.custom<{
  basePrompt: string;
  effectivePrompt: string;
  onClose: () => void;
}>();
export type SystemPromptViewProps = z.infer<typeof SystemPromptViewPropsSchema>;

function firstLines(text: string, limit: number): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.length <= limit) return lines;
  return [...lines.slice(0, limit), `... ${lines.length - limit} more lines`];
}

export function SystemPromptView({
  basePrompt,
  effectivePrompt,
  onClose,
}: SystemPromptViewProps) {
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;
  const maxEffectiveLines = Math.max(4, terminalHeight - 10);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">System Prompt</Text>
      <Text bold>Base</Text>
      {firstLines(basePrompt, 4).map((line, index) => (
        <Text key={`base:${index}`}>{line.length > 0 ? line : " "}</Text>
      ))}
      <Text dimColor>{"-".repeat(72)}</Text>
      <Text bold>Effective</Text>
      {firstLines(effectivePrompt, maxEffectiveLines).map((line, index) => (
        <Text key={`effective:${index}`}>{line.length > 0 ? line : " "}</Text>
      ))}
      <Text dimColor>{"-".repeat(72)}</Text>
      <Text dimColor>ESC close | edit systemPrompt in config to change base prompt</Text>
    </Box>
  );
}

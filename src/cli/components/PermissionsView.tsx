import { z } from "zod";
import { Box, Text, useInput } from "ink";
import { CLIPermissionDecisionSchema, type CLIPermissionConfig, type CLIPermissionDecision } from "../config.js";

export const PermissionRuleRowSchema = z.object({
  target: z.string(),
  decision: z.lazy(() => CLIPermissionDecisionSchema),
  reason: z.string(),
}) as z.ZodType<{
  target: string;
  decision: CLIPermissionDecision;
  reason: string;
}>;
export type PermissionRuleRow = z.infer<typeof PermissionRuleRowSchema>;

export const PermissionsViewPropsSchema = z.custom<{
  permission: CLIPermissionConfig;
  autoApprove: boolean;
  onClose: () => void;
}>();
export type PermissionsViewProps = z.infer<typeof PermissionsViewPropsSchema>;

function isDecision(value: unknown): value is CLIPermissionDecision {
  return value === "allow" || value === "ask" || value === "deny";
}

export function flattenPermissionRules(permission: CLIPermissionConfig): PermissionRuleRow[] {
  const rows: PermissionRuleRow[] = [];
  for (const [target, rule] of Object.entries(permission)) {
    if (isDecision(rule)) {
      rows.push({
        target,
        decision: rule,
        reason: target === "*" ? "global fallback" : "tool rule",
      });
      continue;
    }

    for (const [pattern, decision] of Object.entries(rule)) {
      rows.push({
        target: `${target}:${pattern}`,
        decision,
        reason: "pattern rule",
      });
    }
  }
  return rows.sort((a, b) => a.target.localeCompare(b.target));
}

function decisionColor(decision: CLIPermissionDecision): string {
  if (decision === "allow") return "green";
  if (decision === "deny") return "red";
  return "yellow";
}

export function PermissionsView({
  permission,
  autoApprove,
  onClose,
}: PermissionsViewProps) {
  const rows = flattenPermissionRules(permission);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Permissions</Text>
      <Text dimColor>Auto approval: {autoApprove ? "on" : "off"}</Text>
      <Text dimColor>{"-".repeat(72)}</Text>
      {rows.map((row) => (
        <Text key={row.target}>
          <Text color={decisionColor(row.decision)}>{row.decision.toUpperCase()}</Text>
          <Text> {row.target}</Text>
          <Text dimColor> {row.reason}</Text>
        </Text>
      ))}
      {rows.length === 0 && <Text dimColor>No permission rules configured</Text>}
      <Text dimColor>{"-".repeat(72)}</Text>
      <Text dimColor>ESC close | /permissions set shell:npm * allow | /permissions unset write</Text>
    </Box>
  );
}

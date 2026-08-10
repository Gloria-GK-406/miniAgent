import { z } from "zod";
import type { CLIAgentMode, CLIPermissionConfig, CLIPermissionDecision } from "../config.js";
import type { CLIPermissionRequest, CLIPermissionResult } from "./types.js";

export const PermissionServiceSchema = z.custom<{
  resolve(request: CLIPermissionRequest, autoApprove: boolean): CLIPermissionResult;
  updateConfig(config: CLIPermissionConfig): void;
}>();
export type PermissionService = z.infer<typeof PermissionServiceSchema>;

export const SessionPermissionDecisionSchema = z.enum(["allow", "deny"]);
export type SessionPermissionDecision = z.infer<typeof SessionPermissionDecisionSchema>;

export const SessionPermissionServiceSchema = z.intersection(PermissionServiceSchema, z.custom<{
  rememberSessionDecision(request: CLIPermissionRequest, decision: SessionPermissionDecision): void;
  clearSessionDecisions(): void;
}>()) as z.ZodType<PermissionService & {
  rememberSessionDecision(request: CLIPermissionRequest, decision: SessionPermissionDecision): void;
  clearSessionDecisions(): void;
}>;
export type SessionPermissionService = z.infer<typeof SessionPermissionServiceSchema>;

export const ModeAwarePermissionServiceOptionsSchema = z.custom<{
  base: PermissionService;
  getMode: () => CLIAgentMode;
}>();
export type ModeAwarePermissionServiceOptions = z.infer<typeof ModeAwarePermissionServiceOptionsSchema>;

const PLAN_MUTATING_TOOL_NAMES = new Set([
  "write",
  "delete",
  "move",
  "edit",
  "multi_edit",
  "patch",
  "shell",
  "git_commit",
]);

function isDecision(value: unknown): value is CLIPermissionDecision {
  return value === "allow" || value === "ask" || value === "deny";
}

function getCommandText(args: Record<string, unknown>): string {
  const value = args["command"];
  return typeof value === "string" ? value : "";
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
    .join(",")}}`;
}

function sessionDecisionKey(request: CLIPermissionRequest): string {
  return `${request.toolName}\0${stableSerialize(request.args)}`;
}

export function matchCommandPattern(pattern: string, command: string): boolean {
  if (pattern === "*") {
    return true;
  }
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`).test(command);
}

function resolveNestedRule(
  toolName: string,
  args: Record<string, unknown>,
  nested: Record<string, CLIPermissionDecision>,
): CLIPermissionResult {
  const text = toolName === "shell" ? getCommandText(args) : JSON.stringify(args);
  for (const [pattern, decision] of Object.entries(nested)) {
    if (pattern !== "*" && matchCommandPattern(pattern, text)) {
      return { decision, reason: `${toolName} pattern ${pattern}` };
    }
  }
  const fallback = nested["*"];
  if (fallback !== undefined) {
    return { decision: fallback, reason: `${toolName} pattern *` };
  }
  return { decision: "ask", reason: `${toolName} nested fallback` };
}

export function createPermissionService(config: CLIPermissionConfig): PermissionService {
  let permissionConfig = config;

  return {
    resolve: (request, autoApprove): CLIPermissionResult => {
      const toolRule = permissionConfig[request.toolName];
      let result: CLIPermissionResult;

      if (isDecision(toolRule)) {
        result = { decision: toolRule, reason: `tool rule ${request.toolName}` };
      } else if (toolRule !== undefined) {
        result = resolveNestedRule(
          request.toolName,
          request.args,
          toolRule as Record<string, CLIPermissionDecision>,
        );
      } else {
        const fallback = permissionConfig["*"];
        result = isDecision(fallback)
          ? { decision: fallback, reason: "global rule *" }
          : { decision: "ask", reason: "implicit ask" };
      }

      if (result.decision === "ask" && autoApprove) {
        return { decision: "allow", reason: "auto approve" };
      }
      return result;
    },
    updateConfig: (nextConfig) => {
      permissionConfig = nextConfig;
    },
  };
}

export function createSessionPermissionService(base: PermissionService): SessionPermissionService {
  const sessionDecisions = new Map<string, SessionPermissionDecision>();

  return {
    resolve: (request, autoApprove): CLIPermissionResult => {
      const configResult = base.resolve(request, false);
      if (configResult.decision === "deny") {
        return configResult;
      }
      const decision = sessionDecisions.get(sessionDecisionKey(request));
      if (decision !== undefined) {
        return {
          decision,
          reason: `session rule ${request.toolName}`,
        };
      }
      if (autoApprove && configResult.decision === "ask") {
        return { decision: "allow", reason: "auto approve" };
      }
      return configResult;
    },
    updateConfig: (config) => {
      base.updateConfig(config);
    },
    rememberSessionDecision: (request, decision) => {
      sessionDecisions.set(sessionDecisionKey(request), decision);
    },
    clearSessionDecisions: () => {
      sessionDecisions.clear();
    },
  };
}

export function createModeAwarePermissionService(
  options: ModeAwarePermissionServiceOptions,
): PermissionService {
  return {
    resolve: (request, autoApprove): CLIPermissionResult => {
      if (options.getMode() !== "plan" || !PLAN_MUTATING_TOOL_NAMES.has(request.toolName)) {
        return options.base.resolve(request, autoApprove);
      }

      const result = options.base.resolve(request, false);
      if (result.decision === "allow" && result.reason === "global rule *") {
        return {
          decision: "ask",
          reason: `plan mode default ${request.toolName}`,
        };
      }
      return result;
    },
    updateConfig: (config) => {
      options.base.updateConfig(config);
    },
  };
}

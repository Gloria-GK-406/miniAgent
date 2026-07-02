import type { CLIAgentMode, CLIPermissionConfig, CLIPermissionDecision } from "../config.js";
import type { CLIPermissionRequest, CLIPermissionResult } from "./types.js";

export interface PermissionService {
  resolve(request: CLIPermissionRequest, autoApprove: boolean): CLIPermissionResult;
  updateConfig(config: CLIPermissionConfig): void;
}

export interface ModeAwarePermissionServiceOptions {
  base: PermissionService;
  getMode: () => CLIAgentMode;
}

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

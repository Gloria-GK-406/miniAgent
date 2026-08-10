import { z } from "zod";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createFunctionSchema, createProtocolSchema } from "../../core/index.js";
import {
  CLIAGENT_DIR,
  CLIPermissionConfigSchema,
  loadConfig,
  type CLIConfig,
  type CLIPermissionConfig,
  type CLIPermissionDecision,
} from "../config.js";

export const PermissionRuleTargetSchema = z.object({
  toolName: z.string(),
  pattern: z.string().optional(),
});
export type PermissionRuleTarget = z.infer<typeof PermissionRuleTargetSchema>;

export const PermissionConfigServiceSchema = createProtocolSchema({
  setRule: createFunctionSchema<(
    target: string,
    decision: CLIPermissionDecision,
    effectivePermission: CLIPermissionConfig,
  ) => Promise<CLIConfig>>(),
  unsetRule: createFunctionSchema<(target: string) => Promise<CLIConfig>>(),
});
export type PermissionConfigService = z.infer<typeof PermissionConfigServiceSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDecision(value: unknown): value is CLIPermissionDecision {
  return value === "allow" || value === "ask" || value === "deny";
}

function projectConfigPath(baseDir: string): string {
  return join(baseDir, CLIAGENT_DIR, "config.json");
}

async function readProjectConfig(baseDir: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(projectConfigPath(baseDir), "utf-8");
    const raw = JSON.parse(content.replace(/^\uFEFF/, "")) as unknown;
    if (!isRecord(raw)) {
      throw new Error("Project config must be a JSON object");
    }
    return raw;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeProjectConfig(baseDir: string, config: Record<string, unknown>): Promise<void> {
  const path = projectConfigPath(baseDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

function clonePermission(permission: CLIPermissionConfig): CLIPermissionConfig {
  const next: CLIPermissionConfig = {};
  for (const [toolName, rule] of Object.entries(permission)) {
    next[toolName] = isDecision(rule) ? rule : { ...rule };
  }
  return next;
}

function readLocalPermission(config: Record<string, unknown>): CLIPermissionConfig {
  if (config["permission"] === undefined) {
    return {};
  }
  const result = CLIPermissionConfigSchema.safeParse(config["permission"]);
  if (!result.success) {
    throw new Error("Project permission config is invalid");
  }
  return clonePermission(result.data);
}

function writeLocalPermission(
  config: Record<string, unknown>,
  permission: CLIPermissionConfig,
): Record<string, unknown> {
  const next = { ...config };
  if (Object.keys(permission).length === 0) {
    delete next["permission"];
    return next;
  }
  next["permission"] = permission;
  return next;
}

export function parsePermissionRuleTarget(target: string): PermissionRuleTarget {
  const trimmed = target.trim();
  if (trimmed.length === 0) {
    throw new Error("Permission target is empty");
  }

  const separator = trimmed.indexOf(":");
  if (separator === -1) {
    return { toolName: trimmed };
  }

  const toolName = trimmed.slice(0, separator).trim();
  const pattern = trimmed.slice(separator + 1).trim();
  if (toolName.length === 0 || pattern.length === 0) {
    throw new Error("Permission pattern target must use <tool>:<pattern>");
  }
  return { toolName, pattern };
}

function getNestedFallback(
  toolName: string,
  localRule: CLIPermissionConfig[string] | undefined,
  effectivePermission: CLIPermissionConfig,
): CLIPermissionDecision {
  if (isDecision(localRule)) {
    return localRule;
  }

  const effectiveRule = effectivePermission[toolName];
  if (isDecision(effectiveRule)) {
    return effectiveRule;
  }
  if (effectiveRule !== undefined && effectiveRule["*"] !== undefined) {
    return effectiveRule["*"];
  }
  return "ask";
}

function setRule(
  permission: CLIPermissionConfig,
  target: PermissionRuleTarget,
  decision: CLIPermissionDecision,
  effectivePermission: CLIPermissionConfig,
): CLIPermissionConfig {
  const next = clonePermission(permission);
  if (target.pattern === undefined) {
    next[target.toolName] = decision;
    return next;
  }

  const localRule = next[target.toolName];
  const nested = localRule !== undefined && !isDecision(localRule)
    ? { ...localRule }
    : {};
  if (nested["*"] === undefined) {
    nested["*"] = getNestedFallback(target.toolName, localRule, effectivePermission);
  }
  nested[target.pattern] = decision;
  next[target.toolName] = nested;
  return next;
}

function unsetRule(
  permission: CLIPermissionConfig,
  target: PermissionRuleTarget,
): CLIPermissionConfig {
  const next = clonePermission(permission);
  if (target.pattern === undefined) {
    delete next[target.toolName];
    return next;
  }

  const localRule = next[target.toolName];
  if (localRule === undefined) {
    return next;
  }
  if (isDecision(localRule)) {
    if (target.pattern === "*") {
      delete next[target.toolName];
    }
    return next;
  }

  const nested = { ...localRule };
  delete nested[target.pattern];
  if (Object.keys(nested).length === 0) {
    delete next[target.toolName];
    return next;
  }
  next[target.toolName] = nested;
  return next;
}

export function createPermissionConfigService(baseDir: string): PermissionConfigService {
  return {
    setRule: async (target, decision, effectivePermission) => {
      const config = await readProjectConfig(baseDir);
      const permission = setRule(
        readLocalPermission(config),
        parsePermissionRuleTarget(target),
        decision,
        effectivePermission,
      );
      await writeProjectConfig(baseDir, writeLocalPermission(config, permission));
      return loadConfig(baseDir);
    },
    unsetRule: async (target) => {
      const config = await readProjectConfig(baseDir);
      const permission = unsetRule(
        readLocalPermission(config),
        parsePermissionRuleTarget(target),
      );
      await writeProjectConfig(baseDir, writeLocalPermission(config, permission));
      return loadConfig(baseDir);
    },
  };
}

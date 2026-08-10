import { z } from "zod";
import { createFunctionSchema, createProtocolSchema, MiniAgent, ModelPresetSchema } from "../../core/index.js";
import { SessionMetaSchema } from "../session-manager.js";
import {
  MessageSchema,
  TokenCountSchema,
  ToolCallMessageSchema,
  ToolResultMessageSchema,
} from "../../core/index.js";
import { ToolSchema, type Tool } from "../../core/index.js";
import { TodoItemSnapshotSchema, type TodoItemSnapshot } from "../../extensions/index.js";
import {
  CLIAgentModeSchema,
  CLIConfigSchema,
  CLIPermissionDecisionSchema,
  NodePlatformSchema,
  type CLIAgentMode,
  type CLIPermissionDecision,
} from "../config.js";
import { DiagnosticResultSchema } from "./diagnostics-service.js";
import { CLIDoctorCheckSchema } from "./doctor-service.js";
import type { ProjectInstructionsResult } from "./project-instructions-service.js";
import { SnapshotRecordSchema } from "./snapshot-service.js";
import { CLISubagentSummarySchema } from "./subagent-service.js";

export const CLIViewPanelSchema = z.union([z.object({
  type: z.literal("none"),
}), z.object({
  type: z.literal("about"),
  info: z.lazy(() => CLIAboutInfoSchema),
}), z.object({
  type: z.literal("overview"),
  info: z.lazy(() => CLIOverviewInfoSchema),
}), z.object({
  type: z.literal("status"),
}), z.object({
  type: z.literal("help"),
  query: z.string().optional(),
}), z.object({
  type: z.literal("keybindings"),
}), z.object({
  type: z.literal("history"),
  messages: z.array(MessageSchema),
}), z.object({
  type: z.literal("context"),
  messages: z.array(MessageSchema),
}), z.object({
  type: z.literal("input-history"),
  query: z.string().optional(),
  entries: z.array(z.lazy(() => CLIInputHistoryPanelEntrySchema)),
}), z.object({
  type: z.literal("todos"),
  todos: z.array(TodoItemSnapshotSchema),
  query: z.string().optional(),
}), z.object({
  type: z.literal("search"),
  query: z.string(),
  hits: z.array(z.lazy(() => CLITranscriptSearchHitSchema)),
}), z.object({
  type: z.literal("search-all"),
  query: z.string(),
  hits: z.array(z.lazy(() => CLISessionSearchHitSchema)),
}), z.object({
  type: z.literal("references"),
  references: z.array(z.string()),
}), z.object({
  type: z.literal("models"),
}), z.object({
  type: z.literal("connect"),
}), z.object({
  type: z.literal("sessions"),
  sessions: z.array(SessionMetaSchema),
  query: z.string().optional(),
}), z.object({
  type: z.literal("agents"),
  mode: CLIAgentModeSchema,
  subagents: z.array(CLISubagentSummarySchema),
}), z.object({
  type: z.literal("tools"),
  tools: z.array(ToolSchema),
  query: z.string().optional(),
}), z.object({
  type: z.literal("permissions"),
  permission: CLIConfigSchema.shape.permission,
  autoApprove: z.boolean(),
}), z.object({
  type: z.literal("system"),
  basePrompt: z.string(),
  effectivePrompt: z.string(),
}), z.object({
  type: z.literal("config"),
  title: z.string(),
  content: z.string(),
}), z.object({
  type: z.literal("git"),
  title: z.string(),
  content: z.string(),
}), z.object({
  type: z.literal("diff"),
  title: z.string(),
  content: z.string(),
}), z.object({
  type: z.literal("snapshots"),
  records: z.array(SnapshotRecordSchema),
}), z.object({
  type: z.literal("diagnostics"),
  results: z.array(DiagnosticResultSchema),
}), z.object({
  type: z.literal("doctor"),
  checks: z.array(CLIDoctorCheckSchema),
}), z.object({
  type: z.literal("activity"),
  entries: z.array(z.lazy(() => CLIActivityEntrySchema)),
}), z.object({
  type: z.literal("error"),
  message: z.string(),
})]);
export type CLIViewPanel = z.infer<typeof CLIViewPanelSchema>;

export const CLIAboutInfoSchema = z.object({
  packageVersion: z.string(),
  nodeVersion: z.string(),
  platform: NodePlatformSchema,
  arch: z.string(),
  baseDir: z.string(),
  projectConfigPath: z.string(),
  globalConfigPath: z.string(),
  modelCount: z.number(),
  sessionCount: z.number(),
  builtinCommandCount: z.number(),
  customCommandCount: z.number(),
});
export type CLIAboutInfo = z.infer<typeof CLIAboutInfoSchema>;

export const CLIOverviewGitInfoSchema = z.object({
  repository: z.boolean(),
  branch: z.string().optional(),
  changedFiles: z.number(),
  stagedFiles: z.number(),
  untrackedFiles: z.number(),
  summary: z.string(),
});
export type CLIOverviewGitInfo = z.infer<typeof CLIOverviewGitInfoSchema>;

export const CLIOverviewInfoSchema = z.object({
  workspace: z.string(),
  sessionId: z.string(),
  sessionName: z.string(),
  sessionCount: z.number(),
  mode: CLIAgentModeSchema,
  modelName: z.string(),
  messageCount: z.number(),
  tokenUsage: TokenCountSchema,
  autoApprove: z.boolean(),
  showReasoning: z.boolean(),
  showToolDetails: z.boolean(),
  defaultPermission: CLIPermissionDecisionSchema,
  todoCounts: z.object({
  pending: z.number(),
  inProgress: z.number(),
  completed: z.number(),
  total: z.number(),
}),
  activityCounts: z.object({
  running: z.number(),
  done: z.number(),
  error: z.number(),
  total: z.number(),
}),
  git: CLIOverviewGitInfoSchema,
});
export type CLIOverviewInfo = z.infer<typeof CLIOverviewInfoSchema>;

export const CLIApprovalRequestSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
  decision: z.literal("pending"),
});
export type CLIApprovalRequest = z.infer<typeof CLIApprovalRequestSchema>;

export const CLIApprovalDecisionSchema = z.enum(["allow", "deny", "allow-session", "deny-session"]);
export type CLIApprovalDecision = z.infer<typeof CLIApprovalDecisionSchema>;

export const CLIApprovalAnswerSchema = z.union([CLIApprovalDecisionSchema, z.boolean()]);
export type CLIApprovalAnswer = z.infer<typeof CLIApprovalAnswerSchema>;

export const CLIActivityEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(["tool", "subagent", "approval"]),
  name: z.string(),
  status: z.enum(["running", "done", "error"]),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  summary: z.string(),
});
export type CLIActivityEntry = z.infer<typeof CLIActivityEntrySchema>;

export const CLIInputHistoryPanelEntrySchema = z.object({
  index: z.number(),
  text: z.string(),
});
export type CLIInputHistoryPanelEntry = z.infer<typeof CLIInputHistoryPanelEntrySchema>;

export const CLITranscriptSearchHitSchema = z.object({
  id: z.string(),
  index: z.number(),
  role: z.enum(["system", "user", "assistant", "tool-call", "tool-result"]),
  preview: z.string(),
});
export type CLITranscriptSearchHit = z.infer<typeof CLITranscriptSearchHitSchema>;

export const CLISessionSearchHitSchema = z.intersection(CLITranscriptSearchHitSchema, z.object({
  sessionId: z.string(),
  sessionName: z.string(),
}));
export type CLISessionSearchHit = z.infer<typeof CLISessionSearchHitSchema>;

export const CLICommandHelpSourceSchema = z.enum(["builtin", "custom"]);
export type CLICommandHelpSource = z.infer<typeof CLICommandHelpSourceSchema>;

export const CLICommandHelpItemSchema = z.object({
  name: z.string(),
  aliases: z.array(z.string()),
  description: z.string(),
  usage: z.string(),
  source: CLICommandHelpSourceSchema,
});
export type CLICommandHelpItem = z.infer<typeof CLICommandHelpItemSchema>;

export const CLIStateSchema = z.object({
  baseDir: z.string(),
  config: CLIConfigSchema,
  mode: CLIAgentModeSchema,
  modelName: z.string(),
  modelPaths: z.array(z.string()),
  commandSuggestions: z.array(z.string()),
  commandHelp: z.array(CLICommandHelpItemSchema),
  referencePaths: z.array(z.string()),
  inputHistory: z.array(z.string()),
  sessionId: z.string(),
  sessionName: z.string(),
  sessions: z.array(SessionMetaSchema),
  autoApprove: z.boolean(),
  showReasoning: z.boolean(),
  showToolDetails: z.boolean(),
  isRunning: z.boolean(),
  currentTool: z.union([z.string(), z.null()]),
  messages: z.array(MessageSchema),
  streamingText: z.string(),
  reasoningText: z.string(),
  turnCount: z.number(),
  tokenUsage: TokenCountSchema,
  activity: z.array(CLIActivityEntrySchema),
  panel: CLIViewPanelSchema,
  approval: z.union([CLIApprovalRequestSchema, z.null()]),
  error: z.union([z.string(), z.null()]),
  exitRequested: z.boolean(),
});
export type CLIState = z.infer<typeof CLIStateSchema>;

export const CLIInputOverridesSchema = z.object({
  mode: CLIAgentModeSchema.optional(),
  model: z.string().optional(),
});
export type CLIInputOverrides = z.infer<typeof CLIInputOverridesSchema>;

export const CLIProviderConnectionSchema = z.object({
  engine: z.string(),
  key: z.string(),
  baseURL: z.string().optional(),
  models: z.array(ModelPresetSchema),
  defaultModel: z.string(),
});
export type CLIProviderConnection = z.infer<typeof CLIProviderConnectionSchema>;

export const CLIDiffOptionsSchema = z.object({
  staged: z.boolean().optional(),
});
export type CLIDiffOptions = z.infer<typeof CLIDiffOptionsSchema>;

export const CLIEventSchema = z.union([z.object({
  type: z.literal("state"),
  state: CLIStateSchema,
}), z.object({
  type: z.literal("notice"),
  level: z.union([z.literal("info"), z.literal("warn"), z.literal("error")]),
  message: z.string(),
}), z.object({
  type: z.literal("tool:start"),
  toolCall: ToolCallMessageSchema,
}), z.object({
  type: z.literal("tool:result"),
  toolCall: ToolCallMessageSchema,
  result: ToolResultMessageSchema,
})]);
export type CLIEvent = z.infer<typeof CLIEventSchema>;

export const CLIRuntimeSubscriberSchema = createFunctionSchema<(
  event: CLIEvent
) => void>();
export type CLIRuntimeSubscriber = z.infer<typeof CLIRuntimeSubscriberSchema>;

export const CLIAppRuntimeSchema = createProtocolSchema({
  getState: createFunctionSchema<() => CLIState>(),
  subscribe: createFunctionSchema<(listener: CLIRuntimeSubscriber) => () => void>(),
  submitInput: createFunctionSchema<(input: string) => Promise<void>>(),
  submitInputWithOverrides: createFunctionSchema<(
    input: string,
    overrides: CLIInputOverrides,
  ) => Promise<void>>(),
  runCommand: createFunctionSchema<(name: string, args: string) => Promise<void>>(),
  showOverview: createFunctionSchema<() => Promise<void>>(),
  selectModel: createFunctionSchema<(path: string) => Promise<void>>(),
  connectProvider: createFunctionSchema<(
    connection: CLIProviderConnection,
  ) => Promise<void>>(),
  setAgentMode: createFunctionSchema<(mode: CLIAgentMode) => Promise<void>>(),
  rememberInputHistory: createFunctionSchema<(input: string) => Promise<void>>(),
  createSession: createFunctionSchema<(name?: string) => Promise<void>>(),
  switchSession: createFunctionSchema<(id: string) => Promise<void>>(),
  clearSession: createFunctionSchema<() => Promise<void>>(),
  renameSession: createFunctionSchema<(id: string, name: string) => Promise<void>>(),
  deleteSession: createFunctionSchema<(id: string) => Promise<void>>(),
  forkSession: createFunctionSchema<(id: string, name?: string) => Promise<void>>(),
  exportSession: createFunctionSchema<(
    format: "json" | "markdown",
    outputPath?: string,
  ) => Promise<string>>(),
  importSession: createFunctionSchema<(
    inputPath: string,
    name?: string,
  ) => Promise<void>>(),
  undo: createFunctionSchema<() => Promise<void>>(),
  redo: createFunctionSchema<() => Promise<void>>(),
  restoreSnapshot: createFunctionSchema<(turnId: string) => Promise<void>>(),
  reapplySnapshot: createFunctionSchema<(turnId: string) => Promise<void>>(),
  compactContext: createFunctionSchema<() => Promise<void>>(),
  showGitStatus: createFunctionSchema<() => Promise<void>>(),
  showGitLog: createFunctionSchema<(limit?: number) => Promise<void>>(),
  showDiff: createFunctionSchema<(
    path?: string,
    options?: CLIDiffOptions,
  ) => Promise<void>>(),
  showSnapshots: createFunctionSchema<() => Promise<void>>(),
  openEditor: createFunctionSchema<(initialContent: string) => Promise<string>>(),
  runDiagnostics: createFunctionSchema<() => Promise<void>>(),
  runDoctor: createFunctionSchema<() => Promise<void>>(),
  listTools: createFunctionSchema<() => Promise<Tool[]>>(),
  listTodos: createFunctionSchema<() => TodoItemSnapshot[]>(),
  searchSessions: createFunctionSchema<(
    query: string,
  ) => Promise<CLISessionSearchHit[]>>(),
  showActivity: createFunctionSchema<() => Promise<void>>(),
  showAgents: createFunctionSchema<() => Promise<void>>(),
  initializeProjectInstructions: createFunctionSchema<(
    overwrite: boolean,
  ) => Promise<ProjectInstructionsResult>>(),
  setPermissionRule: createFunctionSchema<(
    target: string,
    decision: CLIPermissionDecision,
  ) => Promise<void>>(),
  unsetPermissionRule: createFunctionSchema<(target: string) => Promise<void>>(),
  setSystemPrompt: createFunctionSchema<(prompt: string) => Promise<void>>(),
  unsetSystemPrompt: createFunctionSchema<() => Promise<void>>(),
  answerApproval: createFunctionSchema<(
    id: string,
    decision: CLIApprovalAnswer,
  ) => void>(),
  stop: createFunctionSchema<() => void>(),
  requestExit: createFunctionSchema<() => Promise<void>>(),
  rebuildAgent: createFunctionSchema<(reason: string) => Promise<void>>(),
  destroy: createFunctionSchema<() => Promise<void>>(),
});
export type CLIAppRuntime = z.infer<typeof CLIAppRuntimeSchema>;

export const CLICommandContextSchema = createProtocolSchema({
  runtime: CLIAppRuntimeSchema,
  agent: z.instanceof(MiniAgent),
  getState: createFunctionSchema<() => CLIState>(),
  updateState: createFunctionSchema<(patch: Partial<CLIState>) => void>(),
  notice: createFunctionSchema<(
    level: "info" | "warn" | "error",
    message: string,
  ) => void>(),
});
export type CLICommandContext = z.infer<typeof CLICommandContextSchema>;

export const CLICommandSchema = createProtocolSchema({
  name: z.string(),
  aliases: z.array(z.string()).optional(),
  description: z.string(),
  usage: z.string(),
  hidden: z.boolean().optional(),
  execute: createFunctionSchema<(
    ctx: CLICommandContext,
    args: string,
  ) => Promise<void>>(),
  complete: createFunctionSchema<(
    ctx: CLICommandContext,
    args: string,
  ) => Promise<string[]>>().optional(),
});
export type CLICommand = z.infer<typeof CLICommandSchema>;

export const CLIPermissionRequestSchema = z.object({
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
});
export type CLIPermissionRequest = z.infer<typeof CLIPermissionRequestSchema>;

export const CLIPermissionResultSchema = z.object({
  decision: CLIPermissionDecisionSchema,
  reason: z.string(),
});
export type CLIPermissionResult = z.infer<typeof CLIPermissionResultSchema>;

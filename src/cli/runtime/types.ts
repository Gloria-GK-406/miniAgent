import { z } from "zod";
import type { MiniAgent } from "../../core/index.js";
import { ModelPresetSchema, type ModelPreset } from "../../core/index.js";
import { SessionMetaSchema, type SessionMeta } from "../session-manager.js";
import {
  MessageSchema,
  TokenCountSchema,
  ToolCallMessageSchema,
  ToolResultMessageSchema,
  type Message,
  type TokenCount,
  type ToolCallMessage,
  type ToolResultMessage,
} from "../../core/index.js";
import { ToolSchema, type Tool } from "../../core/index.js";
import { TodoItemSnapshotSchema, type TodoItemSnapshot } from "../../extensions/index.js";
import {
  CLIAgentModeSchema,
  CLIConfigSchema,
  CLIPermissionDecisionSchema,
  NodePlatformSchema,
  type CLIAgentMode,
  type CLIConfig,
  type CLIPermissionDecision,
} from "../config.js";
import { DiagnosticResultSchema, type DiagnosticResult } from "./diagnostics-service.js";
import { CLIDoctorCheckSchema, type CLIDoctorCheck } from "./doctor-service.js";
import type { ProjectInstructionsResult } from "./project-instructions-service.js";
import { SnapshotRecordSchema, type SnapshotRecord } from "./snapshot-service.js";
import { CLISubagentSummarySchema, type CLISubagentSummary } from "./subagent-service.js";

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
})]) as z.ZodType<| { type: "none" }
  | { type: "about"; info: CLIAboutInfo }
  | { type: "overview"; info: CLIOverviewInfo }
  | { type: "status" }
  | { type: "help"; query?: string }
  | { type: "keybindings" }
  | { type: "history"; messages: Message[] }
  | { type: "context"; messages: Message[] }
  | { type: "input-history"; query?: string; entries: CLIInputHistoryPanelEntry[] }
  | { type: "todos"; todos: TodoItemSnapshot[]; query?: string }
  | { type: "search"; query: string; hits: CLITranscriptSearchHit[] }
  | { type: "search-all"; query: string; hits: CLISessionSearchHit[] }
  | { type: "references"; references: string[] }
  | { type: "models" }
  | { type: "connect" }
  | { type: "sessions"; sessions: SessionMeta[]; query?: string }
  | { type: "agents"; mode: CLIAgentMode; subagents: CLISubagentSummary[] }
  | { type: "tools"; tools: Tool[]; query?: string }
  | { type: "permissions"; permission: CLIConfig["permission"]; autoApprove: boolean }
  | { type: "system"; basePrompt: string; effectivePrompt: string }
  | { type: "config"; title: string; content: string }
  | { type: "git"; title: string; content: string }
  | { type: "diff"; title: string; content: string }
  | { type: "snapshots"; records: SnapshotRecord[] }
  | { type: "diagnostics"; results: DiagnosticResult[] }
  | { type: "doctor"; checks: CLIDoctorCheck[] }
  | { type: "activity"; entries: CLIActivityEntry[] }
  | { type: "error"; message: string }>;
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
}) as z.ZodType<{
  repository: boolean;
  branch?: string;
  changedFiles: number;
  stagedFiles: number;
  untrackedFiles: number;
  summary: string;
}>;
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
}) as z.ZodType<{
  workspace: string;
  sessionId: string;
  sessionName: string;
  sessionCount: number;
  mode: CLIAgentMode;
  modelName: string;
  messageCount: number;
  tokenUsage: TokenCount;
  autoApprove: boolean;
  showReasoning: boolean;
  showToolDetails: boolean;
  defaultPermission: CLIPermissionDecision;
  todoCounts: {
    pending: number;
    inProgress: number;
    completed: number;
    total: number;
  };
  activityCounts: {
    running: number;
    done: number;
    error: number;
    total: number;
  };
  git: CLIOverviewGitInfo;
}>;
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
}) as z.ZodType<{
  id: string;
  kind: "tool" | "subagent" | "approval";
  name: string;
  status: "running" | "done" | "error";
  startedAt: string;
  endedAt?: string;
  summary: string;
}>;
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
})) as z.ZodType<CLITranscriptSearchHit & {
  sessionId: string;
  sessionName: string;
}>;
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
}) as z.ZodType<{
  baseDir: string;
  config: CLIConfig;
  mode: CLIAgentMode;
  modelName: string;
  modelPaths: string[];
  commandSuggestions: string[];
  commandHelp: CLICommandHelpItem[];
  referencePaths: string[];
  inputHistory: string[];
  sessionId: string;
  sessionName: string;
  sessions: SessionMeta[];
  autoApprove: boolean;
  showReasoning: boolean;
  showToolDetails: boolean;
  isRunning: boolean;
  currentTool: string | null;
  messages: Message[];
  streamingText: string;
  reasoningText: string;
  turnCount: number;
  tokenUsage: TokenCount;
  activity: CLIActivityEntry[];
  panel: CLIViewPanel;
  approval: CLIApprovalRequest | null;
  error: string | null;
  exitRequested: boolean;
}>;
export type CLIState = z.infer<typeof CLIStateSchema>;

export const CLIInputOverridesSchema = z.object({
  mode: CLIAgentModeSchema.optional(),
  model: z.string().optional(),
}) as z.ZodType<{
  mode?: CLIAgentMode;
  model?: string;
}>;
export type CLIInputOverrides = z.infer<typeof CLIInputOverridesSchema>;

export const CLIProviderConnectionSchema = z.object({
  engine: z.string(),
  key: z.string(),
  baseURL: z.string().optional(),
  models: z.array(ModelPresetSchema),
  defaultModel: z.string(),
}) as z.ZodType<{
  engine: string;
  key: string;
  baseURL?: string;
  models: ModelPreset[];
  defaultModel: string;
}>;
export type CLIProviderConnection = z.infer<typeof CLIProviderConnectionSchema>;

export const CLIDiffOptionsSchema = z.object({
  staged: z.boolean().optional(),
}) as z.ZodType<{
  staged?: boolean;
}>;
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
})]) as z.ZodType<| { type: "state"; state: CLIState }
  | { type: "notice"; level: "info" | "warn" | "error"; message: string }
  | { type: "tool:start"; toolCall: ToolCallMessage }
  | { type: "tool:result"; toolCall: ToolCallMessage; result: ToolResultMessage }>;
export type CLIEvent = z.infer<typeof CLIEventSchema>;

export const CLIRuntimeSubscriberSchema = z.custom<{
  (event: CLIEvent): void;
}>();
export type CLIRuntimeSubscriber = z.infer<typeof CLIRuntimeSubscriberSchema>;

export const CLIAppRuntimeSchema = z.custom<{
  getState(): CLIState;
  subscribe(listener: CLIRuntimeSubscriber): () => void;
  submitInput(input: string): Promise<void>;
  submitInputWithOverrides(input: string, overrides: CLIInputOverrides): Promise<void>;
  runCommand(name: string, args: string): Promise<void>;
  showOverview(): Promise<void>;
  selectModel(path: string): Promise<void>;
  connectProvider(connection: CLIProviderConnection): Promise<void>;
  setAgentMode(mode: CLIAgentMode): Promise<void>;
  rememberInputHistory(input: string): Promise<void>;
  createSession(name?: string): Promise<void>;
  switchSession(id: string): Promise<void>;
  clearSession(): Promise<void>;
  renameSession(id: string, name: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  forkSession(id: string, name?: string): Promise<void>;
  exportSession(format: "json" | "markdown", outputPath?: string): Promise<string>;
  importSession(inputPath: string, name?: string): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  restoreSnapshot(turnId: string): Promise<void>;
  reapplySnapshot(turnId: string): Promise<void>;
  compactContext(): Promise<void>;
  showGitStatus(): Promise<void>;
  showGitLog(limit?: number): Promise<void>;
  showDiff(path?: string, options?: CLIDiffOptions): Promise<void>;
  showSnapshots(): Promise<void>;
  openEditor(initialContent: string): Promise<string>;
  runDiagnostics(): Promise<void>;
  runDoctor(): Promise<void>;
  listTools(): Promise<Tool[]>;
  listTodos(): TodoItemSnapshot[];
  searchSessions(query: string): Promise<CLISessionSearchHit[]>;
  showActivity(): Promise<void>;
  showAgents(): Promise<void>;
  initializeProjectInstructions(overwrite: boolean): Promise<ProjectInstructionsResult>;
  setPermissionRule(target: string, decision: CLIPermissionDecision): Promise<void>;
  unsetPermissionRule(target: string): Promise<void>;
  setSystemPrompt(prompt: string): Promise<void>;
  unsetSystemPrompt(): Promise<void>;
  answerApproval(id: string, decision: CLIApprovalAnswer): void;
  stop(): void;
  requestExit(): Promise<void>;
  rebuildAgent(reason: string): Promise<void>;
  destroy(): Promise<void>;
}>();
export type CLIAppRuntime = z.infer<typeof CLIAppRuntimeSchema>;

export const CLICommandContextSchema = z.custom<{
  runtime: CLIAppRuntime;
  agent: MiniAgent;
  getState: () => CLIState;
  updateState: (patch: Partial<CLIState>) => void;
  notice: (level: "info" | "warn" | "error", message: string) => void;
}>();
export type CLICommandContext = z.infer<typeof CLICommandContextSchema>;

export const CLICommandSchema = z.custom<{
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  hidden?: boolean;
  execute(ctx: CLICommandContext, args: string): Promise<void>;
  complete?(ctx: CLICommandContext, args: string): Promise<string[]>;
}>();
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

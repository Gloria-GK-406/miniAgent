import type { MiniAgent } from "../../core/agent.js";
import type { SessionMeta } from "../../core/session.js";
import type {
  Message,
  TokenCount,
  ToolCallMessage,
  ToolResultMessage,
} from "../../core/types.js";
import type { Tool } from "../../tool/types.js";
import type { TodoItemSnapshot } from "../../tool/todo.js";
import type { CLIAgentMode, CLIConfig, CLIPermissionDecision } from "../config.js";
import type { DiagnosticResult } from "./diagnostics-service.js";
import type { CLIDoctorCheck } from "./doctor-service.js";
import type { ProjectInstructionsResult } from "./project-instructions-service.js";
import type { SnapshotRecord } from "./snapshot-service.js";
import type { CLISubagentSummary } from "./subagent-service.js";

export type CLIViewPanel =
  | { type: "none" }
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
  | { type: "error"; message: string };

export interface CLIAboutInfo {
  packageVersion: string;
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  baseDir: string;
  projectConfigPath: string;
  globalConfigPath: string;
  modelCount: number;
  sessionCount: number;
  builtinCommandCount: number;
  customCommandCount: number;
}

export interface CLIOverviewGitInfo {
  repository: boolean;
  branch?: string;
  changedFiles: number;
  stagedFiles: number;
  untrackedFiles: number;
  summary: string;
}

export interface CLIOverviewInfo {
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
}

export interface CLIApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  decision: "pending";
}

export type CLIApprovalDecision =
  | "allow"
  | "deny"
  | "allow-session"
  | "deny-session";

export type CLIApprovalAnswer = CLIApprovalDecision | boolean;

export interface CLIActivityEntry {
  id: string;
  kind: "tool" | "subagent" | "approval";
  name: string;
  status: "running" | "done" | "error";
  startedAt: string;
  endedAt?: string;
  summary: string;
}

export interface CLIInputHistoryPanelEntry {
  index: number;
  text: string;
}

export interface CLITranscriptSearchHit {
  id: string;
  index: number;
  role: "system" | "user" | "assistant" | "tool-call" | "tool-result";
  preview: string;
}

export interface CLISessionSearchHit extends CLITranscriptSearchHit {
  sessionId: string;
  sessionName: string;
}

export type CLICommandHelpSource = "builtin" | "custom";

export interface CLICommandHelpItem {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  source: CLICommandHelpSource;
}

export interface CLIState {
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
}

export interface CLIInputOverrides {
  mode?: CLIAgentMode;
  model?: string;
}

export interface CLIDiffOptions {
  staged?: boolean;
}

export type CLIEvent =
  | { type: "state"; state: CLIState }
  | { type: "notice"; level: "info" | "warn" | "error"; message: string }
  | { type: "tool:start"; toolCall: ToolCallMessage }
  | { type: "tool:result"; toolCall: ToolCallMessage; result: ToolResultMessage };

export interface CLIRuntimeSubscriber {
  (event: CLIEvent): void;
}

export interface CLIAppRuntime {
  getState(): CLIState;
  subscribe(listener: CLIRuntimeSubscriber): () => void;
  submitInput(input: string): Promise<void>;
  submitInputWithOverrides(input: string, overrides: CLIInputOverrides): Promise<void>;
  runCommand(name: string, args: string): Promise<void>;
  showOverview(): Promise<void>;
  selectModel(path: string): Promise<void>;
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
}

export interface CLICommandContext {
  runtime: CLIAppRuntime;
  agent: MiniAgent;
  getState: () => CLIState;
  updateState: (patch: Partial<CLIState>) => void;
  notice: (level: "info" | "warn" | "error", message: string) => void;
}

export interface CLICommand {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  hidden?: boolean;
  execute(ctx: CLICommandContext, args: string): Promise<void>;
  complete?(ctx: CLICommandContext, args: string): Promise<string[]>;
}

export interface CLIPermissionRequest {
  toolName: string;
  args: Record<string, unknown>;
}

export interface CLIPermissionResult {
  decision: CLIPermissionDecision;
  reason: string;
}

import type { MiniAgent } from "../../core/agent.js";
import type { SessionMeta } from "../../core/session.js";
import type {
  Message,
  TokenCount,
  ToolCallMessage,
  ToolResultMessage,
} from "../../core/types.js";
import type { Tool } from "../../tool/types.js";
import type { CLIAgentMode, CLIConfig, CLIPermissionDecision } from "../config.js";
import type { DiagnosticResult } from "./diagnostics-service.js";
import type { ProjectInstructionsResult } from "./project-instructions-service.js";

export type CLIViewPanel =
  | { type: "none" }
  | { type: "help" }
  | { type: "history"; messages: Message[] }
  | { type: "context"; messages: Message[] }
  | { type: "models" }
  | { type: "sessions"; sessions: SessionMeta[] }
  | { type: "tools"; tools: Tool[] }
  | { type: "permissions"; permission: CLIConfig["permission"]; autoApprove: boolean }
  | { type: "system"; basePrompt: string; effectivePrompt: string }
  | { type: "git"; title: string; content: string }
  | { type: "diff"; title: string; content: string }
  | { type: "diagnostics"; results: DiagnosticResult[] }
  | { type: "activity"; entries: CLIActivityEntry[] }
  | { type: "error"; message: string };

export interface CLIApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  decision: "pending";
}

export interface CLIActivityEntry {
  id: string;
  kind: "tool" | "subagent";
  name: string;
  status: "running" | "done" | "error";
  startedAt: string;
  endedAt?: string;
  summary: string;
}

export interface CLIState {
  baseDir: string;
  config: CLIConfig;
  mode: CLIAgentMode;
  modelName: string;
  modelPaths: string[];
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
  runCommand(name: string, args: string): Promise<void>;
  selectModel(path: string): Promise<void>;
  createSession(name?: string): Promise<void>;
  switchSession(id: string): Promise<void>;
  renameSession(id: string, name: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  forkSession(id: string, name?: string): Promise<void>;
  exportSession(format: "json" | "markdown", outputPath?: string): Promise<string>;
  importSession(inputPath: string, name?: string): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  compactContext(): Promise<void>;
  showGitStatus(): Promise<void>;
  showGitLog(limit?: number): Promise<void>;
  showDiff(path?: string): Promise<void>;
  openEditor(initialContent: string): Promise<string>;
  runDiagnostics(): Promise<void>;
  showActivity(): Promise<void>;
  initializeProjectInstructions(overwrite: boolean): Promise<ProjectInstructionsResult>;
  setPermissionRule(target: string, decision: CLIPermissionDecision): Promise<void>;
  unsetPermissionRule(target: string): Promise<void>;
  answerApproval(id: string, decision: boolean): void;
  stop(): void;
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

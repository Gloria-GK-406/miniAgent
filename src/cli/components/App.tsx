import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { Message } from "../../core/types.js";
import { useRuntime } from "../hooks/useRuntime.js";
import { useSuggestion } from "../hooks/useSuggestion.js";
import type {
  CLIAppRuntime,
  CLIApprovalDecision,
  CLICommandHelpItem,
  CLIViewPanel,
} from "../runtime/types.js";
import type { SnapshotRecord } from "../runtime/snapshot-service.js";
import { buildRenderableLines } from "./MessageList.js";
import type { RenderLine } from "./MessageList.js";
import { StatusIndicator } from "./StatusIndicator.js";
import { CommandPalette } from "./CommandPalette.js";
import { InputBox } from "./InputBox.js";
import { ModelSelectView } from "./ModelSelectView.js";
import { PanelView } from "./PanelView.js";
import { DiffView } from "./DiffView.js";
import { ActivityView } from "./ActivityView.js";
import { ApprovalPrompt } from "./ApprovalPrompt.js";
import { PermissionsView } from "./PermissionsView.js";
import { SystemPromptView } from "./SystemPromptView.js";
import { createModeAwarePermissionService, createPermissionService } from "../runtime/permission-service.js";
import type { CLIAgentMode, CLIPermissionConfig, CLIPermissionDecision } from "../config.js";

export interface AppProps {
  runtime: CLIAppRuntime;
}

const BOTTOM_RESERVED = 6;
const EXIT_CONFIRM_MS = 2000;
export const EXIT_CONFIRM_TEXT = "Press Ctrl+C again to exit";
export const STATIC_PANEL_CLOSE_TEXT = "ESC close";

export type CtrlCAction = "stop" | "arm-exit" | "exit";

export function nextAgentMode(mode: CLIAgentMode): CLIAgentMode {
  return mode === "build" ? "plan" : "build";
}

function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

function formatTokenUsage(tokenUsage: {
  input: number;
  output: number;
  total: number;
}): string {
  return `${formatTokenCount(tokenUsage.input)} in / ${formatTokenCount(tokenUsage.output)} out / ${formatTokenCount(tokenUsage.total)} total`;
}

export function resolveCtrlCAction(isRunning: boolean, exitArmed: boolean): CtrlCAction {
  if (isRunning) {
    return "stop";
  }
  return exitArmed ? "exit" : "arm-exit";
}

export type MessageScrollAction = "none" | "page-up" | "page-down" | "home" | "end";

export interface MessageScrollKey {
  upArrow?: boolean;
  downArrow?: boolean;
  pageUp?: boolean;
  pageDown?: boolean;
  ctrl?: boolean;
  home?: boolean;
  end?: boolean;
}

export function resolveMessageScrollAction(input: string, key: MessageScrollKey): MessageScrollAction {
  if (key.pageUp || (key.ctrl === true && input === "u")) {
    return "page-up";
  }
  if (key.pageDown || (key.ctrl === true && input === "d")) {
    return "page-down";
  }
  if (key.home) {
    return "home";
  }
  if (key.end) {
    return "end";
  }
  return "none";
}

export interface MessageWindow {
  visibleLines: RenderLine[];
  maxScrollFromBottom: number;
  scrollFromBottom: number;
}

export function padMessageWindow(
  lines: RenderLine[],
  messageAreaHeight: number,
): RenderLine[] {
  const fillerCount = Math.max(0, messageAreaHeight - lines.length);
  return [
    ...Array.from({ length: fillerCount }, (_, index) => ({
      key: `__pad__:${index}`,
      text: "",
    })),
    ...lines,
  ];
}

export function getMessageWindow(
  lines: RenderLine[],
  messageAreaHeight: number,
  scrollFromBottom: number,
): MessageWindow {
  const maxScrollFromBottom = Math.max(0, lines.length - messageAreaHeight);
  const clampedScrollFromBottom = Math.min(
    Math.max(0, scrollFromBottom),
    maxScrollFromBottom,
  );
  const end = lines.length - clampedScrollFromBottom;
  const start = Math.max(0, end - messageAreaHeight);

  return {
    visibleLines: lines.slice(start, end),
    maxScrollFromBottom,
    scrollFromBottom: clampedScrollFromBottom,
  };
}

function closePanel(runtime: CLIAppRuntime): void {
  void runtime.runCommand("panel-close", "");
}

function StaticPanelFrame({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useInput((_input, key) => {
    if (key.escape) {
      onClose();
    }
  });

  return (
    <Box flexDirection="column">
      {children}
      <Text dimColor>{STATIC_PANEL_CLOSE_TEXT}</Text>
    </Box>
  );
}

function panelTitle(panel: Extract<CLIViewPanel, { type: "history" | "context" }>): string {
  return panel.type === "history" ? "History" : "Context";
}

function commandHelpLabel(command: CLICommandHelpItem): string {
  const aliases = command.aliases.length > 0
    ? ` (${command.aliases.map((alias) => `/${alias}`).join(", ")})`
    : "";
  const source = command.source === "custom" ? " [custom]" : "";
  return `/${command.name}${aliases}${source}`;
}

function commandMatchesHelpQuery(command: CLICommandHelpItem, query: string): boolean {
  const normalized = query.toLowerCase();
  return [
    command.name,
    ...command.aliases,
    command.description,
    command.usage,
  ].some((value) => value.toLowerCase().includes(normalized));
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function pluralMatches(count: number): string {
  return `${count} ${count === 1 ? "match" : "matches"}`;
}

const KEYBINDING_ROWS = [
  ["Enter", "Submit prompt or confirm selection"],
  ["Tab", "Complete suggestion or switch build/plan"],
  ["Up / Down", "Navigate suggestions and input history"],
  ["PgUp / PgDn", "Scroll the transcript"],
  ["Home / End", "Jump transcript to oldest or latest"],
  ["Esc", "Close panel or deny approval"],
  ["Ctrl+C", "Stop running agent or arm exit"],
  ["a / d", "Allow or deny approval for this session"],
] as const;

function defaultPermissionLabel(permission: CLIPermissionConfig): CLIPermissionDecision {
  const fallback = permission["*"];
  return fallback === "allow" || fallback === "deny" || fallback === "ask"
    ? fallback
    : "ask";
}

function HelpPanel({ runtime }: { runtime: CLIAppRuntime }) {
  const state = runtime.getState();
  const panel = state.panel.type === "help" ? state.panel : { type: "help" as const };
  const query = panel.query?.trim();
  const visibleCommandHelp = query === undefined || query.length === 0
    ? state.commandHelp
    : state.commandHelp.filter((command) => commandMatchesHelpQuery(command, query));
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">
        {query === undefined || query.length === 0 ? "Help" : `Help matching "${query}"`}
      </Text>
      {state.commandHelp.length === 0 ? (
        <>
          <Text>/about /overview /help /commands /keybindings /status /config /history</Text>
          <Text>/input-history /context /search /search-all /todos /references /tools</Text>
          <Text>/models /sessions /activity /snapshots /permissions /system /agent build|plan</Text>
          <Text>/auto /details /thinking /git /diff /editor /diagnostics /doctor /quit</Text>
        </>
      ) : visibleCommandHelp.length === 0 ? (
        <Text dimColor>{`No commands match "${query}"`}</Text>
      ) : (
        visibleCommandHelp.map((command) => (
          <Box key={`${command.source}:${command.name}`} flexDirection="column">
            <Text>
              <Text color="cyan">{commandHelpLabel(command)}</Text>
              <Text> - {command.description}</Text>
            </Text>
            <Text dimColor>  {command.usage}</Text>
          </Box>
        ))
      )}
      <Text dimColor>Tab build/plan | Ctrl+C stop/exit | PgUp/PgDn scroll</Text>
      {state.commandHelp.length === 0 && <Text dimColor>{state.commandSuggestions.join(" ")}</Text>}
      <Text dimColor>{state.mode} mode</Text>
    </StaticPanelFrame>
  );
}

function AboutPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "about" }>;
  runtime: CLIAppRuntime;
}) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">MiniAgent</Text>
      <Text>Version: {panel.info.packageVersion}</Text>
      <Text>Node: {panel.info.nodeVersion}</Text>
      <Text>Platform: {panel.info.platform} {panel.info.arch}</Text>
      <Text>Workspace: {panel.info.baseDir}</Text>
      <Text>Project config: {panel.info.projectConfigPath}</Text>
      <Text>Global config: {panel.info.globalConfigPath}</Text>
      <Text>Models: {panel.info.modelCount}</Text>
      <Text>Sessions: {panel.info.sessionCount}</Text>
      <Text>
        Commands: {panel.info.builtinCommandCount} builtin / {panel.info.customCommandCount} custom
      </Text>
    </StaticPanelFrame>
  );
}

function OverviewPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "overview" }>;
  runtime: CLIAppRuntime;
}) {
  const gitLine = panel.info.git.repository
    ? `Git: ${panel.info.git.branch ?? "(detached)"} - ${panel.info.git.summary}`
    : `Git: ${panel.info.git.summary}`;

  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">Overview</Text>
      <Text>Workspace: {panel.info.workspace}</Text>
      <Text>
        Session: {panel.info.sessionName} ({panel.info.sessionId}) - {plural(panel.info.sessionCount, "session")}
      </Text>
      <Text>Agent: {panel.info.mode}</Text>
      <Text>Model: {panel.info.modelName}</Text>
      <Text>Transcript: {plural(panel.info.messageCount, "message")}</Text>
      <Text>Tokens: {formatTokenUsage(panel.info.tokenUsage)}</Text>
      <Text>
        Todos: {panel.info.todoCounts.pending} pending / {panel.info.todoCounts.inProgress} active /{" "}
        {panel.info.todoCounts.completed} done
      </Text>
      <Text>
        Activity: {panel.info.activityCounts.running} running / {panel.info.activityCounts.done} done /{" "}
        {panel.info.activityCounts.error} errors
      </Text>
      <Text>{gitLine}</Text>
      <Text>
        Permissions: {panel.info.defaultPermission} default, auto {panel.info.autoApprove ? "on" : "off"}
      </Text>
      <Text>Reasoning: {panel.info.showReasoning ? "on" : "off"}</Text>
      <Text>Tool details: {panel.info.showToolDetails ? "on" : "off"}</Text>
    </StaticPanelFrame>
  );
}

function KeybindingsPanel({ runtime }: { runtime: CLIAppRuntime }) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">Keybindings</Text>
      {KEYBINDING_ROWS.map(([key, action]) => (
        <Text key={key}>
          <Text color="cyan">{key}</Text>
          <Text> - {action}</Text>
        </Text>
      ))}
    </StaticPanelFrame>
  );
}

function StatusPanel({ runtime }: { runtime: CLIAppRuntime }) {
  const state = runtime.getState();
  const permission = state.config.permission ?? ({ "*": "ask" } satisfies CLIPermissionConfig);
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">Status</Text>
      <Text>Workspace: {state.baseDir}</Text>
      <Text>
        Session: {state.sessionName} ({state.sessionId})
      </Text>
      <Text>Agent: {state.mode}</Text>
      <Text>Model: {state.modelName}</Text>
      <Text>Transcript: {plural(state.messages.length, "message")}</Text>
      <Text>Tokens: {formatTokenUsage(state.tokenUsage)}</Text>
      <Text>Auto approval: {state.autoApprove ? "on" : "off"}</Text>
      <Text>Reasoning: {state.showReasoning ? "on" : "off"}</Text>
      <Text>Tool details: {state.showToolDetails ? "on" : "off"}</Text>
      <Text>Default permission: {defaultPermissionLabel(permission)}</Text>
    </StaticPanelFrame>
  );
}

function decisionColor(decision: CLIPermissionDecision): string {
  if (decision === "allow") return "green";
  if (decision === "deny") return "red";
  return "yellow";
}

function ToolsPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "tools" }>;
  runtime: CLIAppRuntime;
}) {
  const state = runtime.getState();
  const permission = state.config.permission ?? ({ "*": "ask" } satisfies CLIPermissionConfig);
  const permissionService = createModeAwarePermissionService({
    base: createPermissionService(permission),
    getMode: () => state.mode,
  });

  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">
        {panel.query === undefined
          ? `Tools (${panel.tools.length})`
          : `Tools matching "${panel.query}" (${panel.tools.length})`}
      </Text>
      {panel.tools.length === 0 ? (
        <Text dimColor>No tools found</Text>
      ) : (
        panel.tools.map((tool) => {
          const result = permissionService.resolve({
            toolName: tool.name,
            args: {},
          }, state.autoApprove);
          return (
            <Text key={tool.name}>
              <Text color={decisionColor(result.decision)}>{result.decision.toUpperCase()}</Text>
              <Text> </Text>
              <Text color="cyan">{tool.name}</Text>
              <Text dimColor> {tool.description}</Text>
              <Text dimColor> ({result.reason})</Text>
            </Text>
          );
        })
      )}
    </StaticPanelFrame>
  );
}

function SessionsPanel({ runtime, panel }: { runtime: CLIAppRuntime; panel: Extract<CLIViewPanel, { type: "sessions" }> }) {
  const state = runtime.getState();
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">
        {panel.query === undefined ? "Sessions" : `Sessions matching "${panel.query}"`}
      </Text>
      {panel.sessions.map((session) => {
        const marker = session.id === state.sessionId ? "*" : " ";
        return (
          <Text key={session.id}>
            {marker} {session.name} ({session.id.slice(0, 8)}) {session.messageCount} messages
          </Text>
        );
      })}
      {panel.sessions.length === 0 && <Text dimColor>No sessions found</Text>}
    </StaticPanelFrame>
  );
}

function AgentsPanel({
  runtime,
  panel,
}: {
  runtime: CLIAppRuntime;
  panel: Extract<CLIViewPanel, { type: "agents" }>;
}) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">Agents</Text>
      <Text bold>Primary modes</Text>
      <Text>{panel.mode === "build" ? "*" : " "} build</Text>
      <Text>{panel.mode === "plan" ? "*" : " "} plan</Text>
      <Text bold>Subagents ({panel.subagents.length})</Text>
      {panel.subagents.map((subagent) => (
        <Text key={subagent.id}>
          <Text color="cyan">{subagent.id}</Text>
          <Text> {subagent.name}</Text>
          {subagent.description.length > 0 && <Text dimColor> {subagent.description}</Text>}
          {subagent.model !== undefined && <Text dimColor> [{subagent.model}]</Text>}
        </Text>
      ))}
      {panel.subagents.length === 0 && <Text dimColor>No configured subagents</Text>}
    </StaticPanelFrame>
  );
}

function ReferencesPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "references" }>;
  runtime: CLIAppRuntime;
}) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">References ({plural(panel.references.length, "file")})</Text>
      {panel.references.length === 0 ? (
        <Text dimColor>No reference candidates</Text>
      ) : (
        panel.references.map((path) => (
          <Text key={path}>{path}</Text>
        ))
      )}
    </StaticPanelFrame>
  );
}

function InputHistoryPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "input-history" }>;
  runtime: CLIAppRuntime;
}) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">
        {panel.query === undefined ? "Input History" : `Input History matching "${panel.query}"`}
      </Text>
      <Text dimColor>{plural(panel.entries.length, "prompt")}</Text>
      {panel.entries.length === 0 ? (
        <Text dimColor>No input history</Text>
      ) : (
        panel.entries.map((entry) => (
          <Box key={`${entry.index}:${entry.text}`} flexDirection="column">
            <Text>
              <Text color="cyan">#{entry.index}</Text>
              <Text> {entry.text}</Text>
            </Text>
          </Box>
        ))
      )}
    </StaticPanelFrame>
  );
}

function todoStatusColor(status: string): string {
  if (status === "completed") return "green";
  if (status === "in_progress") return "yellow";
  return "gray";
}

function TodosPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "todos" }>;
  runtime: CLIAppRuntime;
}) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">
        {panel.query === undefined
          ? `Todos (${panel.todos.length})`
          : `Todos matching "${panel.query}" (${panel.todos.length})`}
      </Text>
      {panel.todos.length === 0 ? (
        <Text dimColor>No todos</Text>
      ) : (
        panel.todos.map((todo, index) => (
          <Box key={todo.id} flexDirection="column">
            <Text>
              <Text color="cyan">#{index + 1}</Text>
              <Text> </Text>
              <Text color={todoStatusColor(todo.status)}>{todo.status.toUpperCase()}</Text>
              <Text> {todo.content}</Text>
              <Text dimColor> ({todo.id})</Text>
            </Text>
          </Box>
        ))
      )}
    </StaticPanelFrame>
  );
}

function SearchPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "search" }>;
  runtime: CLIAppRuntime;
}) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">
        Search "{panel.query}"
      </Text>
      <Text dimColor>{pluralMatches(panel.hits.length)}</Text>
      {panel.hits.length === 0 ? (
        <Text dimColor>No transcript matches</Text>
      ) : (
        panel.hits.map((hit) => (
          <Box key={`${hit.id}:${hit.index}`} flexDirection="column">
            <Text>
              <Text color="cyan">#{hit.index} {hit.role}</Text>
              <Text> {hit.preview}</Text>
            </Text>
          </Box>
        ))
      )}
    </StaticPanelFrame>
  );
}

function SearchAllPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "search-all" }>;
  runtime: CLIAppRuntime;
}) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">
        Search all sessions "{panel.query}"
      </Text>
      <Text dimColor>{pluralMatches(panel.hits.length)}</Text>
      {panel.hits.length === 0 ? (
        <Text dimColor>No session matches</Text>
      ) : (
        panel.hits.map((hit) => (
          <Box key={`${hit.sessionId}:${hit.id}:${hit.index}`} flexDirection="column">
            <Text>
              <Text color="cyan">{hit.sessionName}</Text>
              <Text dimColor> ({hit.sessionId.slice(0, 8)}) </Text>
              <Text color="cyan">#{hit.index} {hit.role}</Text>
              <Text> {hit.preview}</Text>
            </Text>
          </Box>
        ))
      )}
    </StaticPanelFrame>
  );
}

interface SnapshotGroup {
  turnId: string;
  updatedAt: string;
  records: SnapshotRecord[];
}

function snapshotChangeLabel(record: SnapshotRecord): "created" | "deleted" | "modified" | "unchanged" {
  if (!record.beforeExists && record.afterExists) return "created";
  if (record.beforeExists && !record.afterExists) return "deleted";
  if (record.beforeExists && record.afterExists) return "modified";
  return "unchanged";
}

function snapshotChangeColor(change: ReturnType<typeof snapshotChangeLabel>): string {
  if (change === "created") return "green";
  if (change === "deleted") return "red";
  if (change === "modified") return "yellow";
  return "gray";
}

function groupSnapshotRecords(records: SnapshotRecord[]): SnapshotGroup[] {
  const groups = new Map<string, SnapshotGroup>();
  for (const record of records) {
    const existing = groups.get(record.turnId);
    if (existing === undefined) {
      groups.set(record.turnId, {
        turnId: record.turnId,
        updatedAt: record.updatedAt,
        records: [record],
      });
      continue;
    }
    existing.records.push(record);
    if (record.updatedAt > existing.updatedAt) {
      existing.updatedAt = record.updatedAt;
    }
  }
  return [...groups.values()];
}

function SnapshotsPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "snapshots" }>;
  runtime: CLIAppRuntime;
}) {
  const groups = groupSnapshotRecords(panel.records);
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">
        Snapshots ({plural(groups.length, "turn")}, {plural(panel.records.length, "file")})
      </Text>
      {groups.length === 0 ? (
        <Text dimColor>No snapshots recorded</Text>
      ) : (
        groups.map((group) => (
          <Box key={group.turnId} flexDirection="column">
            <Text>
              <Text color="cyan">{group.turnId}</Text>
              <Text dimColor> {plural(group.records.length, "file")} {group.updatedAt}</Text>
            </Text>
            {group.records.map((record) => {
              const change = snapshotChangeLabel(record);
              return (
                <Text key={`${record.turnId}:${record.displayPath}`}>
                  <Text>  </Text>
                  <Text color={snapshotChangeColor(change)}>{change}</Text>
                  <Text> {record.displayPath}</Text>
                </Text>
              );
            })}
          </Box>
        ))
      )}
    </StaticPanelFrame>
  );
}

function ErrorPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "error" }>;
  runtime: CLIAppRuntime;
}) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="red">Error</Text>
      <Text>{panel.message}</Text>
    </StaticPanelFrame>
  );
}

function summarizeDiagnosticOutput(stdout: string, stderr: string): string {
  const text = stdout.trim().length > 0 ? stdout : stderr;
  const firstLine = text.trim().split(/\r?\n/)[0];
  if (firstLine === undefined || firstLine.length === 0) return "(no output)";
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
}

function DiagnosticsPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "diagnostics" }>;
  runtime: CLIAppRuntime;
}) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">Diagnostics</Text>
      {panel.results.length === 0 ? (
        <Text dimColor>No diagnostics configured</Text>
      ) : (
        panel.results.map((result) => {
          const passed = result.exitCode === 0 && !result.timedOut && !result.aborted;
          const label = passed ? "PASS" : "FAIL";
          return (
            <Box key={result.command} flexDirection="column">
              <Text>
                <Text color={passed ? "green" : "red"}>{label}</Text>
                <Text> {result.command}</Text>
              </Text>
              <Text dimColor>
                {summarizeDiagnosticOutput(result.stdout, result.stderr)}
              </Text>
            </Box>
          );
        })
      )}
    </StaticPanelFrame>
  );
}

function doctorStatusColor(status: "pass" | "warn" | "fail"): string {
  if (status === "pass") return "green";
  if (status === "fail") return "red";
  return "yellow";
}

function DoctorPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "doctor" }>;
  runtime: CLIAppRuntime;
}) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">Doctor</Text>
      {panel.checks.map((item) => (
        <Text key={item.id}>
          <Text color={doctorStatusColor(item.status)}>{item.status.toUpperCase()}</Text>
          <Text> {item.label}</Text>
          <Text dimColor> {item.detail}</Text>
        </Text>
      ))}
    </StaticPanelFrame>
  );
}

export function App({ runtime }: AppProps) {
  const { state } = useRuntime(runtime);
  const {
    suggestions,
    selectedIndex,
    hasSuggestions,
    updateInput,
    selectNext,
    selectPrev,
    applySelected,
  } = useSuggestion({
    commandSuggestions: state.commandSuggestions,
    modelPaths: state.modelPaths,
    referencePaths: state.referencePaths,
    sessionSuggestions: state.sessions.map((session) => session.id),
  });
  const { stdout } = useStdout();
  const [scrollFromBottom, setScrollFromBottom] = useState(0);
  const [exitArmed, setExitArmed] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const terminalHeight = stdout?.rows ?? 24;
  const terminalWidth = stdout?.columns ?? 80;
  const messageAreaHeight = Math.max(1, terminalHeight - BOTTOM_RESERVED);
  const messageAreaWidth = Math.max(20, terminalWidth - 2);

  const renderableLines = buildRenderableLines(
    state.messages,
    state.streamingText,
    state.reasoningText,
    messageAreaWidth,
    {
      showReasoning: state.showReasoning,
      showToolDetails: state.showToolDetails,
    },
  );
  const {
    visibleLines,
    maxScrollFromBottom,
    scrollFromBottom: clampedScrollFromBottom,
  } = getMessageWindow(renderableLines, messageAreaHeight, scrollFromBottom);
  const paddedVisibleLines = padMessageWindow(visibleLines, messageAreaHeight);

  useInput((_input, key) => {
    if (state.panel.type !== "none") return;
    const pageSize = Math.max(1, Math.floor(messageAreaHeight / 2));
    const action = resolveMessageScrollAction(_input, key);

    if (action === "page-up") {
      setScrollFromBottom((prev) => Math.min(maxScrollFromBottom, prev + pageSize));
      return;
    }
    if (action === "page-down") {
      setScrollFromBottom((prev) => Math.max(0, prev - pageSize));
      return;
    }
    if (action === "home") {
      setScrollFromBottom(maxScrollFromBottom);
      return;
    }
    if (action === "end") {
      setScrollFromBottom(0);
    }
  });

  useEffect(() => {
    setScrollFromBottom((prev) => Math.min(prev, maxScrollFromBottom));
  }, [maxScrollFromBottom]);

  const clearExitArmed = useCallback(() => {
    if (exitTimer.current !== null) {
      clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    setExitArmed(false);
  }, []);

  useEffect(() => () => {
    if (exitTimer.current !== null) {
      clearTimeout(exitTimer.current);
    }
  }, []);

  const isScrolledUp = clampedScrollFromBottom > 0;
  const canScrollUp = clampedScrollFromBottom < maxScrollFromBottom;

  const handleSubmit = useCallback(
    (text: string) => {
      clearExitArmed();
      setScrollFromBottom(0);
      void runtime.submitInput(text);
    },
    [clearExitArmed, runtime],
  );

  const handleCancel = useCallback(() => {
    const action = resolveCtrlCAction(state.isRunning, exitArmed);
    if (action === "stop") {
      clearExitArmed();
      runtime.stop();
      return;
    }
    if (action === "exit") {
      void runtime.requestExit();
      return;
    }

    setExitArmed(true);
    if (exitTimer.current !== null) {
      clearTimeout(exitTimer.current);
    }
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null;
      setExitArmed(false);
    }, EXIT_CONFIRM_MS);
  }, [clearExitArmed, exitArmed, runtime, state.isRunning]);

  const handleInputChange = useCallback((text: string) => {
    updateInput(text);
  }, [updateInput]);

  const handleSuggestionComplete = useCallback((text: string): string | null => {
    return applySelected(text);
  }, [applySelected]);

  const handleHistoryEntry = useCallback((text: string) => {
    void runtime.rememberInputHistory(text);
  }, [runtime]);

  const handleModeToggle = useCallback(() => {
    void runtime.runCommand("agent", nextAgentMode(state.mode));
  }, [runtime, state.mode]);

  const handleApprovalDecision = useCallback((decision: CLIApprovalDecision) => {
    const approvalId = state.approval?.id;
    if (approvalId === undefined) {
      return;
    }
    runtime.answerApproval(approvalId, decision);
  }, [runtime, state.approval?.id]);

  if (state.panel.type === "history" || state.panel.type === "context") {
    return (
      <PanelView
        data={{ title: panelTitle(state.panel), messages: state.panel.messages }}
        onClose={() => closePanel(runtime)}
      />
    );
  }

  if (state.panel.type === "models") {
    return (
      <ModelSelectView
        modelPaths={state.modelPaths}
        currentModelPath={state.modelName}
        onSelect={runtime.selectModel}
        onClose={() => closePanel(runtime)}
      />
    );
  }

  if (state.panel.type === "help") {
    return <HelpPanel runtime={runtime} />;
  }

  if (state.panel.type === "about") {
    return <AboutPanel panel={state.panel} runtime={runtime} />;
  }

  if (state.panel.type === "overview") {
    return <OverviewPanel panel={state.panel} runtime={runtime} />;
  }

  if (state.panel.type === "keybindings") {
    return <KeybindingsPanel runtime={runtime} />;
  }

  if (state.panel.type === "status") {
    return <StatusPanel runtime={runtime} />;
  }

  if (state.panel.type === "tools") {
    return <ToolsPanel panel={state.panel} runtime={runtime} />;
  }

  if (state.panel.type === "permissions") {
    return (
      <PermissionsView
        permission={state.panel.permission}
        autoApprove={state.panel.autoApprove}
        onClose={() => closePanel(runtime)}
      />
    );
  }

  if (state.panel.type === "system") {
    return (
      <SystemPromptView
        basePrompt={state.panel.basePrompt}
        effectivePrompt={state.panel.effectivePrompt}
        onClose={() => closePanel(runtime)}
      />
    );
  }

  if (state.panel.type === "sessions") {
    return <SessionsPanel runtime={runtime} panel={state.panel} />;
  }

  if (state.panel.type === "agents") {
    return <AgentsPanel runtime={runtime} panel={state.panel} />;
  }

  if (state.panel.type === "references") {
    return <ReferencesPanel runtime={runtime} panel={state.panel} />;
  }

  if (state.panel.type === "input-history") {
    return <InputHistoryPanel runtime={runtime} panel={state.panel} />;
  }

  if (state.panel.type === "todos") {
    return <TodosPanel runtime={runtime} panel={state.panel} />;
  }

  if (state.panel.type === "search") {
    return <SearchPanel runtime={runtime} panel={state.panel} />;
  }

  if (state.panel.type === "search-all") {
    return <SearchAllPanel runtime={runtime} panel={state.panel} />;
  }

  if (state.panel.type === "snapshots") {
    return <SnapshotsPanel runtime={runtime} panel={state.panel} />;
  }

  if (state.panel.type === "error") {
    return <ErrorPanel panel={state.panel} runtime={runtime} />;
  }

  if (state.panel.type === "diagnostics") {
    return <DiagnosticsPanel panel={state.panel} runtime={runtime} />;
  }

  if (state.panel.type === "doctor") {
    return <DoctorPanel panel={state.panel} runtime={runtime} />;
  }

  if (state.panel.type === "activity") {
    return (
      <ActivityView
        entries={state.panel.entries}
        onClose={() => closePanel(runtime)}
      />
    );
  }

  if (
    state.panel.type === "config" ||
    state.panel.type === "git" ||
    state.panel.type === "diff"
  ) {
    return (
      <DiffView
        title={state.panel.title}
        content={state.panel.content}
        onClose={() => closePanel(runtime)}
      />
    );
  }

  if (state.approval !== null) {
    return (
      <Box flexDirection="column">
        <Box flexDirection="column" height={messageAreaHeight} overflow="hidden">
          {paddedVisibleLines.map((line) => (
            <Text
              key={line.key}
              {...(line.color !== undefined && { color: line.color })}
              {...(line.dimColor === true && { dimColor: true })}
            >
              {line.text}
            </Text>
          ))}
        </Box>
        <StatusIndicator
          isRunning={state.isRunning}
          currentTool={state.currentTool}
          turnCount={state.turnCount}
          error={state.error}
        />
        <ApprovalPrompt
          toolName={state.approval.toolName}
          args={state.approval.args}
          onDecision={handleApprovalDecision}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" height={messageAreaHeight} overflow="hidden">
        {paddedVisibleLines.map((line) => (
          <Text
            key={line.key}
            {...(line.color !== undefined && { color: line.color })}
            {...(line.dimColor === true && { dimColor: true })}
          >
            {line.text}
          </Text>
        ))}
      </Box>
      {isScrolledUp && (
        <Text dimColor>
          Older messages above - {clampedScrollFromBottom}/{maxScrollFromBottom} from bottom -
          PgDn/End to follow latest
        </Text>
      )}
      {!isScrolledUp && canScrollUp && (
        <Text dimColor>PgUp/Home to browse history</Text>
      )}
      <StatusIndicator
        isRunning={state.isRunning}
        currentTool={state.currentTool}
        turnCount={state.turnCount}
        error={state.error}
      />
      <CommandPalette
        suggestions={suggestions}
        selectedIndex={selectedIndex}
      />
      <Box borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
        <InputBox
          onSubmit={handleSubmit}
          onChange={handleInputChange}
          onCancel={handleCancel}
          disabled={state.isRunning}
          focused={true}
          hasSuggestions={hasSuggestions}
          initialHistory={state.inputHistory}
          onHistoryEntry={handleHistoryEntry}
          onSuggestionNext={selectNext}
          onSuggestionPrev={selectPrev}
          onSuggestionComplete={handleSuggestionComplete}
          onModeToggle={handleModeToggle}
          {...(state.isRunning && { placeholder: "Thinking..." })}
        />
        <Text>
          <Text bold color="cyan">{state.modelName}</Text>
          <Text dimColor>
            {` ${state.mode} ${state.autoApprove ? "auto" : "ask"} ${state.sessionName} - ${formatTokenUsage(state.tokenUsage)} - /help for commands`}
          </Text>
        </Text>
        {exitArmed && !state.isRunning && (
          <Text color="yellow">{EXIT_CONFIRM_TEXT}</Text>
        )}
      </Box>
    </Box>
  );
}

export type { Message };

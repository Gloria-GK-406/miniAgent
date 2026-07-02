import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { Message } from "../../core/types.js";
import { useRuntime } from "../hooks/useRuntime.js";
import { useSuggestion } from "../hooks/useSuggestion.js";
import type { CLIAppRuntime, CLIViewPanel } from "../runtime/types.js";
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

export interface AppProps {
  runtime: CLIAppRuntime;
}

const BOTTOM_RESERVED = 6;
const EXIT_CONFIRM_MS = 2000;
export const EXIT_CONFIRM_TEXT = "Press Ctrl+C again to exit";
export const STATIC_PANEL_CLOSE_TEXT = "ESC close";

export type CtrlCAction = "stop" | "arm-exit" | "exit";

export function resolveCtrlCAction(isRunning: boolean, exitArmed: boolean): CtrlCAction {
  if (isRunning) {
    return "stop";
  }
  return exitArmed ? "exit" : "arm-exit";
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

function HelpPanel({ runtime }: { runtime: CLIAppRuntime }) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">Help</Text>
      <Text>/help /history /context /tools /models /sessions /activity</Text>
      <Text>/permissions /system /agent build|plan /auto /details</Text>
      <Text>/thinking /git /diff /editor /diagnostics /quit</Text>
      <Text dimColor>{runtime.getState().mode} mode</Text>
    </StaticPanelFrame>
  );
}

function ToolsPanel({
  panel,
  runtime,
}: {
  panel: Extract<CLIViewPanel, { type: "tools" }>;
  runtime: CLIAppRuntime;
}) {
  return (
    <StaticPanelFrame onClose={() => closePanel(runtime)}>
      <Text bold color="cyan">Tools ({panel.tools.length})</Text>
      {panel.tools.map((tool) => (
        <Text key={tool.name}>
          <Text color="cyan">{tool.name}</Text>
          <Text dimColor> {tool.description}</Text>
        </Text>
      ))}
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
  } = useSuggestion({ modelPaths: state.modelPaths });
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

    if (key.upArrow) {
      setScrollFromBottom((prev) => Math.min(maxScrollFromBottom, prev + 1));
      return;
    }
    if (key.downArrow) {
      setScrollFromBottom((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.pageUp || (key.ctrl && _input === "u")) {
      setScrollFromBottom((prev) => Math.min(maxScrollFromBottom, prev + pageSize));
      return;
    }
    if (key.pageDown || (key.ctrl && _input === "d")) {
      setScrollFromBottom((prev) => Math.max(0, prev - pageSize));
      return;
    }
    if (key.home) {
      setScrollFromBottom(maxScrollFromBottom);
      return;
    }
    if (key.end) {
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
      void runtime.destroy().finally(() => {
        process.exit(0);
      });
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

  const handleApprovalDecision = useCallback((decision: boolean) => {
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

  if (state.panel.type === "error") {
    return <ErrorPanel panel={state.panel} runtime={runtime} />;
  }

  if (state.panel.type === "diagnostics") {
    return <DiagnosticsPanel panel={state.panel} runtime={runtime} />;
  }

  if (state.panel.type === "activity") {
    return (
      <ActivityView
        entries={state.panel.entries}
        onClose={() => closePanel(runtime)}
      />
    );
  }

  if (state.panel.type === "git" || state.panel.type === "diff") {
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
          onSuggestionNext={selectNext}
          onSuggestionPrev={selectPrev}
          onSuggestionComplete={handleSuggestionComplete}
          {...(state.isRunning && { placeholder: "Thinking..." })}
        />
        <Box flexDirection="row" gap={1}>
          <Text bold color="cyan">{state.modelName}</Text>
          <Text dimColor>{state.mode}</Text>
          <Text dimColor>{state.autoApprove ? "auto" : "ask"}</Text>
          <Text dimColor>{state.sessionName}</Text>
          <Text dimColor>-</Text>
          <Text dimColor>/help for commands</Text>
        </Box>
        {state.approval && (
          <Text color="yellow">
            Approval requested: {state.approval.toolName}
          </Text>
        )}
        {exitArmed && !state.isRunning && (
          <Text color="yellow">{EXIT_CONFIRM_TEXT}</Text>
        )}
      </Box>
    </Box>
  );
}

export type { Message };

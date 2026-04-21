import { useState, useEffect, useCallback } from "react";
import { Box, Text, useStdout, useInput } from "ink";
import type { Message, TokenCount } from "../../core/types.js";
import { useAgent } from "../hooks/useAgent.js";
import { useSuggestion } from "../hooks/useSuggestion.js";
import { buildRenderableLines } from "./MessageList.js";
import type { RenderLine } from "./MessageList.js";
import { StatusIndicator } from "./StatusIndicator.js";
import { CommandPalette } from "./CommandPalette.js";
import { InputBox } from "./InputBox.js";
import { ModelSelectView } from "./ModelSelectView.js";
import { PanelView } from "./PanelView.js";
import type { PanelData } from "./PanelView.js";

interface AgentLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
  removeAllListeners(event?: string): unknown;
  run(input: Message): Promise<Message[]>;
  getMessages(): Promise<Message[]>;
  previewContext(): Promise<Message[]>;
  getContextCount(): TokenCount;
}

export interface AppProps {
  agent: AgentLike;
  modelName: string;
  modelPaths?: string[];
  sessionName?: string;
  hitlEnabled: boolean;
  tokenUsage: { input: number; output: number; total: number };
  onCommand?: (command: string) => void;
  onSelectModel?: (path: string) => Promise<void> | void;
}

const BOTTOM_RESERVED = 6;

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

export function App({
  agent,
  modelName,
  modelPaths = [],
  sessionName,
  hitlEnabled: _hitlEnabled,
  tokenUsage: _tokenUsage,
  onCommand,
  onSelectModel,
}: AppProps) {
  const state = useAgent(agent);
  const {
    suggestions,
    selectedIndex,
    hasSuggestions,
    updateInput,
    selectNext,
    selectPrev,
    applySelected,
  } = useSuggestion({ modelPaths });
  const { stdout } = useStdout();
  const [scrollFromBottom, setScrollFromBottom] = useState(0);
  const [panelData, setPanelData] = useState<PanelData | null>(null);
  const [isModelSelectOpen, setIsModelSelectOpen] = useState(false);

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
    if (panelData || isModelSelectOpen) return;
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

  const isScrolledUp = clampedScrollFromBottom > 0;
  const canScrollUp = clampedScrollFromBottom < maxScrollFromBottom;

  const handleSubmit = useCallback(
    async (text: string) => {
      setScrollFromBottom(0);
      if (text === "/history" || text.startsWith("/history ")) {
        const messages = await agent.getMessages();
        setPanelData({ title: "History", messages });
      } else if (text === "/context") {
        const ctxMsgs = await agent.previewContext();
        setPanelData({ title: "Context", messages: ctxMsgs });
      } else if ((text === "/models" || text === "/model") && onSelectModel !== undefined) {
        setIsModelSelectOpen(true);
      } else if (text.startsWith("/")) {
        onCommand?.(text);
      } else {
        state.sendMessage(text);
      }
    },
    [state, onCommand, agent, onSelectModel],
  );

  const handleInputChange = useCallback((text: string) => {
    updateInput(text);
  }, [updateInput]);

  const handleSuggestionComplete = useCallback((text: string): string | null => {
    return applySelected(text);
  }, [applySelected]);

  if (panelData) {
    return <PanelView data={panelData} onClose={() => setPanelData(null)} />;
  }

  if (isModelSelectOpen) {
    return (
      <ModelSelectView
        modelPaths={modelPaths}
        currentModelPath={modelName}
        onSelect={async (path) => {
          await onSelectModel?.(path);
        }}
        onClose={() => setIsModelSelectOpen(false)}
      />
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
          ↑ older messages above · {clampedScrollFromBottom}/{maxScrollFromBottom} from bottom ·
          ↓/PgDn/End to follow latest
        </Text>
      )}
      {!isScrolledUp && canScrollUp && (
        <Text dimColor>↑/PgUp/Home to browse history</Text>
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
          disabled={state.isRunning}
          focused={true}
          hasSuggestions={hasSuggestions}
          onSuggestionNext={selectNext}
          onSuggestionPrev={selectPrev}
          onSuggestionComplete={handleSuggestionComplete}
          {...(state.isRunning && { placeholder: "Thinking..." })}
        />
        <Box flexDirection="row" gap={1}>
          <Text bold color="cyan">{modelName}</Text>
          {sessionName && <Text dimColor>{sessionName}</Text>}
          <Text dimColor>·</Text>
          <Text dimColor>/help for commands</Text>
        </Box>
      </Box>
    </Box>
  );
}

export type { Message, TokenCount };

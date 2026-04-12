import { useState, useEffect, useCallback } from "react";
import { Box, Text, useStdout, useInput } from "ink";
import type { Message, TokenCount } from "../../core/types.js";
import { useAgent } from "../hooks/useAgent.js";
import { useSuggestion } from "../hooks/useSuggestion.js";
import { MessageList } from "./MessageList.js";
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
  const [scrollOffset, setScrollOffset] = useState(0);
  const [panelData, setPanelData] = useState<PanelData | null>(null);
  const [isModelSelectOpen, setIsModelSelectOpen] = useState(false);

  const terminalHeight = stdout?.rows ?? 24;
  const messageAreaHeight = Math.max(1, terminalHeight - BOTTOM_RESERVED);

  useEffect(() => {
    setScrollOffset(0);
  }, [state.messages.length]);

  useInput((_input, key) => {
    if (panelData || isModelSelectOpen) return;
    if (state.isRunning) return;
    if (key.pageUp) {
      setScrollOffset((prev) => Math.max(0, prev - Math.max(1, Math.floor(messageAreaHeight / 2))));
    }
    if (key.pageDown) {
      setScrollOffset((prev) => {
        const next = prev + Math.max(1, Math.floor(messageAreaHeight / 2));
        return Math.min(next, maxOffset);
      });
    }
  });

  const allMessages = state.messages;
  const totalHeight = allMessages.length;
  const maxOffset = Math.max(0, totalHeight - messageAreaHeight);
  const clampedOffset = Math.min(scrollOffset, maxOffset);

  const visibleMessages = allMessages.slice(clampedOffset, clampedOffset + messageAreaHeight);
  const isScrolledUp = clampedOffset > 0;
  const canScrollDown = clampedOffset < maxOffset;

  const handleSubmit = useCallback(
    async (text: string) => {
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
        <MessageList
          messages={visibleMessages}
          {...(state.streamingText !== "" && { streamingText: state.streamingText })}
          {...(state.reasoningText !== "" && { reasoningText: state.reasoningText })}
        />
      </Box>
      {isScrolledUp && (
        <Text dimColor>↑ scrolled up ({clampedOffset}/{maxOffset}) — PgDn to scroll down</Text>
      )}
      {canScrollDown && !isScrolledUp && allMessages.length > messageAreaHeight && (
        <Text dimColor>↓ more messages below</Text>
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
          focused={!isScrolledUp}
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

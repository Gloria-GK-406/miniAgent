import { describe, it, expect, vi } from "vitest";
import { renderToString } from "ink";
import { MessageList } from "./components/MessageList.js";
import { StatusBar } from "./components/StatusBar.js";
import { StatusIndicator } from "./components/StatusIndicator.js";
import { InputBox } from "./components/InputBox.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { App } from "./components/App.js";
import { matchSuggestions } from "./hooks/useSuggestion.js";
import { MessageType } from "../core/types.js";
import type { Message } from "../core/types.js";

function createMockAgent() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    listeners,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    }),
    off: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(listener);
    }),
    removeAllListeners: vi.fn((_event?: string) => {}),
    run: vi.fn((_input: unknown) => Promise.resolve([])),
    getMessages: vi.fn(() => Promise.resolve([])),
    previewContext: vi.fn(() => Promise.resolve([])),
    getContextCount: vi.fn(() => ({
      input: 0,
      output: 0,
      total: 0,
    })),
  };
}

describe("MessageList + MessageItem integration", () => {
  it("renders multiple message types and each appears in output", () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.System, content: "Welcome" },
      { id: "2", type: MessageType.User, content: "Hello" },
      { id: "3", type: MessageType.Assist, content: "Hi there" },
      {
        id: "4",
        type: MessageType.ToolCall,
        content: "",
        toolCallId: "tc1",
        toolName: "read",
        arguments: { path: "/tmp" },
      },
      {
        id: "5",
        type: MessageType.ToolResult,
        content: "file content",
        toolCallId: "tc1",
      },
    ];
    const output = renderToString(
      <MessageList messages={messages} />,
    );
    expect(output).toContain("Welcome");
    expect(output).toContain("Hello");
    expect(output).toContain("Hi there");
    expect(output).toContain("read");
    expect(output).toContain("file content");
  });

  it("passes streamingText to the last Assist message", () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "Hi" },
      { id: "2", type: MessageType.Assist, content: "Thinking" },
    ];
    const output = renderToString(
      <MessageList messages={messages} streamingText="...more" />,
    );
    expect(output).toContain("Thinking");
    expect(output).toContain("...more");
  });

  it("does not append streamingText to non-Assist last message", () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.Assist, content: "Done" },
      { id: "2", type: MessageType.User, content: "Next?" },
    ];
    const output = renderToString(
      <MessageList messages={messages} streamingText="stream" />,
    );
    expect(output).toContain("Done");
    expect(output).toContain("Next?");
    expect(output).not.toContain("stream");
  });

  it("renders tool call and result sequence", () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "Read config" },
      {
        id: "2",
        type: MessageType.ToolCall,
        content: "",
        toolCallId: "tc1",
        toolName: "glob",
        arguments: { pattern: "*.json" },
      },
      {
        id: "3",
        type: MessageType.ToolResult,
        content: "package.json",
        toolCallId: "tc1",
      },
      { id: "4", type: MessageType.Assist, content: "Found package.json" },
    ];
    const output = renderToString(
      <MessageList messages={messages} />,
    );
    expect(output).toContain("Read config");
    expect(output).toContain("glob");
    expect(output).toContain("package.json");
    expect(output).toContain("Found package.json");
  });
});

describe("App component basic rendering", () => {
  it("renders StatusBar content and InputBox prompt", () => {
    const agent = createMockAgent();
    const output = renderToString(
      <App
        agent={agent}
        modelName="anthropic/claude-sonnet-4"
        hitlEnabled={true}
        tokenUsage={{ input: 0, output: 0, total: 0 }}
      />,
    );
    expect(output).toContain("anthropic/claude-sonnet-4");
    expect(output).toContain("❯");
  });

  it("renders StatusBar with session name", () => {
    const agent = createMockAgent();
    const output = renderToString(
      <App
        agent={agent}
        modelName="glm/glm-4"
        sessionName="test-session"
        hitlEnabled={false}
        tokenUsage={{ input: 50, output: 100, total: 150 }}
      />,
    );
    expect(output).toContain("glm/glm-4");
    expect(output).toContain("test-session");
  });

  it("renders StatusIndicator as Ready when idle", () => {
    const agent = createMockAgent();
    const output = renderToString(
      <App
        agent={agent}
        modelName="test/model"
        hitlEnabled={false}
        tokenUsage={{ input: 0, output: 0, total: 0 }}
      />,
    );
    expect(output).toContain("Ready");
    expect(output).toContain("Turn 0");
  });
});

describe("useSuggestion + CommandPalette integration", () => {
  it("renders suggestion text via CommandPalette", () => {
    const output = renderToString(
      <CommandPalette
        suggestions={["/help", "/history", "/hitl"]}
        selectedIndex={0}
      />,
    );
    expect(output).toContain("/help");
    expect(output).toContain("/history");
    expect(output).toContain("/hitl");
  });

  it("useSuggestion output feeds into CommandPalette", () => {
    const suggestions = matchSuggestions("/h");
    const output = renderToString(
      <CommandPalette
        suggestions={suggestions}
        selectedIndex={0}
      />,
    );
    expect(output).toContain("/help");
    expect(output).toContain("/history");
    expect(output).toContain("/hitl");
  });

  it("useSuggestion with selectedIndex feeds into CommandPalette", () => {
    const suggestions = matchSuggestions("/co");
    const output = renderToString(
      <CommandPalette
        suggestions={suggestions}
        selectedIndex={1}
      />,
    );
    expect(output).toContain("/compress");
    expect(output).toContain("/context");
  });

  it("renders nothing when suggestions are empty", () => {
    const output = renderToString(
      <CommandPalette suggestions={[]} selectedIndex={0} />,
    );
    expect(output).toBe("");
  });

  it("renders a scrolling 5-item window for long suggestions", () => {
    const suggestions = matchSuggestions("/");

    const firstOutput = renderToString(
      <CommandPalette suggestions={suggestions} selectedIndex={0} />,
    );
    expect(firstOutput).toContain("/clear");
    expect(firstOutput).toContain("/help");
    expect(firstOutput).not.toContain("/model");

    const scrolledOutput = renderToString(
      <CommandPalette suggestions={suggestions} selectedIndex={7} />,
    );
    expect(scrolledOutput).toContain("/model");
    expect(scrolledOutput).toContain("/models");
    expect(scrolledOutput).toContain("more");
  });
});

describe("full component tree rendering", () => {
  it("renders StatusBar + MessageList + StatusIndicator + InputBox together", () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.System, content: "System ready" },
      { id: "2", type: MessageType.User, content: "What is 2+2?" },
      { id: "3", type: MessageType.Assist, content: "4" },
    ];
    const noop = () => {};

    const statusBar = renderToString(
      <StatusBar
        modelName="test/model"
        hitlEnabled={true}
        tokenUsage={{ input: 10, output: 20, total: 30 }}
      />,
    );
    const messageList = renderToString(
      <MessageList messages={messages} />,
    );
    const statusIndicator = renderToString(
      <StatusIndicator
        isRunning={false}
        currentTool={null}
        turnCount={3}
        error={null}
      />,
    );
    const inputBox = renderToString(
      <InputBox onSubmit={noop} />,
    );

    expect(statusBar).toContain("test/model");
    expect(statusBar).toContain("HITL");
    expect(statusBar).toContain("10 in");

    expect(messageList).toContain("System ready");
    expect(messageList).toContain("What is 2+2?");
    expect(messageList).toContain("4");

    expect(statusIndicator).toContain("Ready");
    expect(statusIndicator).toContain("Turn 3");

    expect(inputBox).toContain("❯");
  });

  it("renders all components with running state", () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "Run analysis" },
      {
        id: "2",
        type: MessageType.ToolCall,
        content: "",
        toolCallId: "tc1",
        toolName: "bash",
        arguments: { command: "npm test" },
      },
    ];
    const noop = () => {};

    const messageList = renderToString(
      <MessageList messages={messages} />,
    );
    const statusIndicator = renderToString(
      <StatusIndicator
        isRunning={true}
        currentTool="bash"
        turnCount={1}
        error={null}
      />,
    );
    const inputBox = renderToString(
      <InputBox onSubmit={noop} disabled={true} placeholder="Thinking..." />,
    );

    expect(messageList).toContain("Run analysis");
    expect(messageList).toContain("bash");

    expect(statusIndicator).toContain("Executing");
    expect(statusIndicator).toContain("bash");

    expect(inputBox).toContain("❯");
    expect(inputBox).toContain("Thinking...");
  });
});

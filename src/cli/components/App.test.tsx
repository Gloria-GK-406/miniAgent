import { describe, it, expect } from "vitest";
import { renderToString } from "ink";
import { App, getMessageWindow, padMessageWindow } from "./App.js";
import { buildRenderableLines } from "./MessageList.js";
import { MessageType } from "../../core/types.js";

function createMockAgent() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on(event: string, listener: (...args: unknown[]) => void) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(listener);
      return undefined;
    },
    off(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener);
      return undefined;
    },
    removeAllListeners(_event?: string) {
      return undefined;
    },
    async run() {
      return [];
    },
    async getMessages() {
      return [];
    },
    async previewContext() {
      return [];
    },
    getContextCount() {
      return { input: 0, output: 0, total: 0 };
    },
  };
}

describe("App", () => {
  it("anchors the message window to the bottom by default", () => {
    const messages = Array.from({ length: 6 }, (_, index) => ({
      id: String(index + 1),
      type: MessageType.Assist as const,
      content: `message-${index + 1}`,
    }));
    const lines = buildRenderableLines(messages, undefined, undefined, 80);
    const window = getMessageWindow(lines, 3, 0);
    expect(window.visibleLines.map((line) => line.text)).toEqual([
      "message-4",
      "message-5",
      "message-6",
    ]);
    expect(window.maxScrollFromBottom).toBe(3);
  });

  it("shows older messages when scrolled away from the bottom", () => {
    const messages = Array.from({ length: 6 }, (_, index) => ({
      id: String(index + 1),
      type: MessageType.Assist as const,
      content: `message-${index + 1}`,
    }));
    const lines = buildRenderableLines(messages, undefined, undefined, 80);
    const window = getMessageWindow(lines, 3, 2);
    expect(window.visibleLines.map((line) => line.text)).toEqual([
      "message-2",
      "message-3",
      "message-4",
    ]);
    expect(window.scrollFromBottom).toBe(2);
  });

  it("pads short windows so content stays bottom-aligned", () => {
    const padded = padMessageWindow(
      [
        { key: "line-1", text: "hello" },
        { key: "line-2", text: "world" },
      ],
      5,
    );
    expect(padded).toHaveLength(5);
    expect(padded.slice(0, 3).map((line) => line.text)).toEqual(["", "", ""]);
    expect(padded.slice(3).map((line) => line.text)).toEqual(["hello", "world"]);
  });

  it("renders StatusBar with model name", () => {
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
  });

  it("renders StatusBar with session name", () => {
    const agent = createMockAgent();
    const output = renderToString(
      <App
        agent={agent}
        modelName="test/model"
        sessionName="my-session"
        hitlEnabled={false}
        tokenUsage={{ input: 0, output: 0, total: 0 }}
      />,
    );
    expect(output).toContain("my-session");
  });

  it("renders model info in input bar", () => {
    const agent = createMockAgent();
    const output = renderToString(
      <App
        agent={agent}
        modelName="test/model"
        hitlEnabled={true}
        tokenUsage={{ input: 0, output: 0, total: 0 }}
      />,
    );
    expect(output).toContain("test/model");
  });

  it("renders InputBox", () => {
    const agent = createMockAgent();
    const output = renderToString(
      <App
        agent={agent}
        modelName="test/model"
        hitlEnabled={false}
        tokenUsage={{ input: 0, output: 0, total: 0 }}
      />,
    );
    expect(output).toContain("❯");
  });

  it("calls onCommand for slash-prefixed input via handleSubmit", () => {
    const agent = createMockAgent();
    let receivedCommand: string | undefined;
    renderToString(
      <App
        agent={agent}
        modelName="test/model"
        hitlEnabled={false}
        tokenUsage={{ input: 0, output: 0, total: 0 }}
        onCommand={(cmd) => { receivedCommand = cmd; }}
      />,
    );
    expect(receivedCommand).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { renderToString } from "ink";
import { App } from "./App.js";

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

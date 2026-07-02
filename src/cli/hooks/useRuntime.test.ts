// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CLIAppRuntime, CLIState } from "../runtime/types.js";
import { useRuntime } from "./useRuntime.js";

function state(): CLIState {
  return {
    baseDir: process.cwd(),
    config: {} as CLIState["config"],
    mode: "build",
    modelName: "openai/fast",
    modelPaths: ["openai/fast"],
    sessionId: "s1",
    sessionName: "default",
    sessions: [],
    autoApprove: false,
    showReasoning: false,
    showToolDetails: false,
    isRunning: false,
    currentTool: null,
    messages: [],
    streamingText: "",
    reasoningText: "",
    turnCount: 0,
    tokenUsage: { input: 0, output: 0, total: 0 },
    activity: [],
    panel: { type: "none" },
    approval: null,
    error: null,
  };
}

describe("useRuntime", () => {
  it("subscribes to runtime state", () => {
    let listener: ((event: { type: "state"; state: CLIState }) => void) | undefined;
    const runtime: CLIAppRuntime = {
      getState: vi.fn(state),
      subscribe: vi.fn((next) => {
        listener = next as typeof listener;
        return () => undefined;
      }),
      submitInput: vi.fn(),
      runCommand: vi.fn(),
      selectModel: vi.fn(),
      answerApproval: vi.fn(),
      stop: vi.fn(),
      rebuildAgent: vi.fn(),
      createSession: vi.fn(),
      switchSession: vi.fn(),
      renameSession: vi.fn(),
      deleteSession: vi.fn(),
      forkSession: vi.fn(),
      exportSession: vi.fn(),
      importSession: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      compactContext: vi.fn(),
      showGitStatus: vi.fn(),
      showGitLog: vi.fn(),
      showDiff: vi.fn(),
      openEditor: vi.fn(),
      runDiagnostics: vi.fn(),
      showActivity: vi.fn(),
      initializeProjectInstructions: vi.fn(),
      setPermissionRule: vi.fn(),
      unsetPermissionRule: vi.fn(),
      setSystemPrompt: vi.fn(),
      unsetSystemPrompt: vi.fn(),
      destroy: vi.fn(),
    };

    const { result } = renderHook(() => useRuntime(runtime));
    expect(result.current.state.modelName).toBe("openai/fast");

    act(() => {
      listener?.({ type: "state", state: { ...state(), modelName: "openai/slow" } });
    });

    expect(result.current.state.modelName).toBe("openai/slow");
  });
});

import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runTUIEntry } from "./entry-tui-runner.js";
import type { CLIAppRuntime, CLIEvent, CLIRuntimeSubscriber } from "./runtime/types.js";

function runtime(overrides: Partial<CLIAppRuntime> = {}): CLIAppRuntime {
  return {
    switchSession: vi.fn(async () => undefined),
    createSession: vi.fn(async () => undefined),
    runCommand: vi.fn(async () => undefined),
    selectModel: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    submitInput: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as CLIAppRuntime;
}

describe("runTUIEntry", () => {
  it("starts the TUI in the alternate screen and submits an initial prompt", async () => {
    const appRuntime = runtime();
    const createRuntime = vi.fn(async () => appRuntime);
    const unmount = vi.fn();
    const renderApp = vi.fn(() => ({ unmount }));
    const loadPrompt = vi.fn(async () => "start here");
    const stdout = vi.fn();
    const stderr = vi.fn();
    const exit = vi.fn();
    const removeExitListener = vi.fn();
    const onProcessExit = vi.fn(() => removeExitListener);
    const cwd = resolve("fixtures/project");

    await runTUIEntry({
      action: {
        type: "tui",
        cwd: "fixtures/project",
        sessionId: "session-1",
        autoApprove: true,
        agent: "plan",
        model: "openai/gpt-5",
      },
      createRuntime,
      renderApp,
      loadPrompt,
      streams: { stdout, stderr },
      exit,
      onProcessExit,
    });

    expect(stdout).toHaveBeenNthCalledWith(1, "\x1b[?1049h");
    expect(stdout).toHaveBeenNthCalledWith(2, "\x1b[2J\x1b[H");
    expect(createRuntime).toHaveBeenCalledWith(cwd);
    expect(appRuntime.switchSession).toHaveBeenCalledWith("session-1");
    expect(appRuntime.runCommand).toHaveBeenCalledWith("auto", "");
    expect(appRuntime.runCommand).toHaveBeenCalledWith("agent", "plan");
    expect(appRuntime.selectModel).toHaveBeenCalledWith("openai/gpt-5");
    expect(renderApp).toHaveBeenCalledWith(appRuntime);
    expect(loadPrompt).toHaveBeenCalledWith(expect.objectContaining({ type: "tui" }), cwd);
    expect(appRuntime.submitInput).toHaveBeenCalledWith("start here");
    expect(unmount).not.toHaveBeenCalled();
    expect(appRuntime.destroy).not.toHaveBeenCalled();
    expect(removeExitListener).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it("cleans up rendered TUI resources when loading the initial prompt fails", async () => {
    const appRuntime = runtime();
    const unmount = vi.fn();
    const stdout = vi.fn();
    const stderr = vi.fn();
    const exit = vi.fn();
    const removeExitListener = vi.fn();

    await runTUIEntry({
      action: { type: "tui", promptFile: "missing.txt" },
      createRuntime: vi.fn(async () => appRuntime),
      renderApp: vi.fn(() => ({ unmount })),
      loadPrompt: vi.fn(async () => {
        throw new Error("Prompt file not found");
      }),
      streams: { stdout, stderr },
      exit,
      onProcessExit: vi.fn(() => removeExitListener),
    });

    expect(unmount).toHaveBeenCalledTimes(1);
    expect(appRuntime.destroy).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenLastCalledWith("\x1b[?1049l");
    expect(stderr).toHaveBeenCalledWith("Fatal: Prompt file not found\n");
    expect(removeExitListener).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("cleans up runtime resources when entry option application fails before render", async () => {
    const appRuntime = runtime({
      switchSession: vi.fn(async () => {
        throw new Error("Session not found");
      }),
    });
    const renderApp = vi.fn(() => ({ unmount: vi.fn() }));
    const stdout = vi.fn();
    const stderr = vi.fn();
    const exit = vi.fn();

    await runTUIEntry({
      action: { type: "tui", sessionId: "missing" },
      createRuntime: vi.fn(async () => appRuntime),
      renderApp,
      loadPrompt: vi.fn(async () => undefined),
      streams: { stdout, stderr },
      exit,
      onProcessExit: vi.fn(() => vi.fn()),
    });

    expect(renderApp).not.toHaveBeenCalled();
    expect(appRuntime.destroy).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenLastCalledWith("\x1b[?1049l");
    expect(stderr).toHaveBeenCalledWith("Fatal: Session not found\n");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("unmounts and destroys the runtime once when the TUI requests exit", async () => {
    let listener: CLIRuntimeSubscriber | undefined;
    const appRuntime = runtime({
      subscribe: vi.fn((next: CLIRuntimeSubscriber) => {
        listener = next;
        return () => undefined;
      }),
    });
    const unmount = vi.fn();
    const exit = vi.fn();

    await runTUIEntry({
      action: { type: "tui" },
      createRuntime: vi.fn(async () => appRuntime),
      renderApp: vi.fn(() => ({ unmount })),
      loadPrompt: vi.fn(async () => undefined),
      streams: { stdout: vi.fn(), stderr: vi.fn() },
      exit,
      onProcessExit: vi.fn(() => vi.fn()),
    });

    const event = {
      type: "state",
      state: { exitRequested: true },
    } as CLIEvent;
    listener?.(event);
    listener?.(event);
    await Promise.resolve();
    await Promise.resolve();

    expect(unmount).toHaveBeenCalledTimes(1);
    expect(appRuntime.destroy).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});

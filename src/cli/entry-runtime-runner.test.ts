import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runRuntimeBackedCLIEntry } from "./entry-runtime-runner.js";
import type { CLIAppRuntime } from "./runtime/types.js";

function runtime(overrides: Partial<CLIAppRuntime> = {}): CLIAppRuntime {
  return {
    switchSession: vi.fn(async () => undefined),
    createSession: vi.fn(async () => undefined),
    runCommand: vi.fn(async () => undefined),
    selectModel: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as CLIAppRuntime;
}

describe("runRuntimeBackedCLIEntry", () => {
  it("applies entry options, prepares work, and hands runtime ownership to the runner", async () => {
    const app = runtime();
    const createRuntime = vi.fn(async () => app);
    const stdout = vi.fn();
    const stderr = vi.fn();
    const cwd = resolve("fixtures/project");
    const prepare = vi.fn(async (_runtime: CLIAppRuntime, preparedCwd: string) => `prompt from ${preparedCwd}`);
    const run = vi.fn(async (ownedRuntime: CLIAppRuntime, prepared: string, runCwd: string) => {
      await ownedRuntime.destroy();
      expect(prepared).toBe(`prompt from ${cwd}`);
      expect(runCwd).toBe(cwd);
      return 0;
    });

    await expect(runRuntimeBackedCLIEntry({
      action: {
        type: "print",
        cwd: "fixtures/project",
        sessionId: "session-1",
        agent: "plan",
        autoApprove: true,
        model: "openai/gpt-5",
        prompt: "hello",
      },
      createRuntime,
      streams: { stdout, stderr },
      prepare,
      run,
    })).resolves.toBe(0);

    expect(createRuntime).toHaveBeenCalledWith(cwd);
    expect(app.switchSession).toHaveBeenCalledWith("session-1");
    expect(app.runCommand).toHaveBeenCalledWith("auto", "");
    expect(app.runCommand).toHaveBeenCalledWith("agent", "plan");
    expect(app.selectModel).toHaveBeenCalledWith("openai/gpt-5");
    expect(prepare).toHaveBeenCalledWith(app, cwd);
    expect(run).toHaveBeenCalledWith(app, `prompt from ${cwd}`, cwd);
    expect(app.destroy).toHaveBeenCalledTimes(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it("destroys the runtime and formats errors when entry option application fails", async () => {
    const app = runtime({
      switchSession: vi.fn(async () => {
        throw new Error("Unknown session");
      }),
    });
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runRuntimeBackedCLIEntry({
      action: {
        type: "list-tools",
        sessionId: "missing",
        output: "json",
      },
      createRuntime: vi.fn(async () => app),
      streams: { stdout, stderr },
      run: vi.fn(async () => 0),
    })).resolves.toBe(1);

    expect(app.destroy).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"Unknown session\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("destroys the runtime and skips the runner when preparation fails", async () => {
    const app = runtime();
    const stdout = vi.fn();
    const stderr = vi.fn();
    const run = vi.fn(async () => 0);

    await expect(runRuntimeBackedCLIEntry({
      action: {
        type: "print",
        promptFile: "missing.txt",
      },
      createRuntime: vi.fn(async () => app),
      streams: { stdout, stderr },
      prepare: vi.fn(async () => {
        throw new Error("Prompt file not found");
      }),
      run,
    })).resolves.toBe(1);

    expect(run).not.toHaveBeenCalled();
    expect(app.destroy).toHaveBeenCalledTimes(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith("Fatal: Prompt file not found\n");
  });

  it("formats runner errors without destroying a runtime already handed to the runner", async () => {
    const app = runtime();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runRuntimeBackedCLIEntry({
      action: {
        type: "doctor",
        output: "json",
      },
      createRuntime: vi.fn(async () => app),
      streams: { stdout, stderr },
      run: vi.fn(async (ownedRuntime) => {
        await ownedRuntime.destroy();
        throw new Error("Doctor crashed");
      }),
    })).resolves.toBe(1);

    expect(app.destroy).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"Doctor crashed\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
  });
});

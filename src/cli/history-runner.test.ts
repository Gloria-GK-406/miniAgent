import { describe, expect, it, vi } from "vitest";
import { MessageType } from "../core/types.js";
import type { CLIAppRuntime, CLIState } from "./runtime/types.js";
import {
  formatHistory,
  formatHistoryJson,
  runHistory,
} from "./history-runner.js";

const messages = [
  { id: "u1", type: MessageType.User, content: "Question" },
  { id: "a1", type: MessageType.Assist, content: "Answer" },
];

describe("formatHistory", () => {
  it("formats session messages as text", () => {
    expect(formatHistory(messages)).toBe([
      "user u1",
      "Question",
      "",
      "assist a1",
      "Answer",
      "",
    ].join("\n"));
  });

  it("formats empty history", () => {
    expect(formatHistory([])).toBe("No history messages\n");
  });
});

describe("formatHistoryJson", () => {
  it("formats session messages as json", () => {
    expect(formatHistoryJson(messages)).toContain("\"messages\"");
  });
});

describe("runHistory", () => {
  it("runs the history command, prints messages, and destroys the runtime", async () => {
    let panel: CLIState["panel"] = { type: "none" };
    const runtime = {
      runCommand: vi.fn(async () => {
        panel = { type: "history", messages };
      }),
      getState: () => ({ panel }) as CLIState,
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runHistory(runtime, { stdout, stderr })).resolves.toBe(0);

    expect(runtime.runCommand).toHaveBeenCalledWith("history", "");
    expect(stdout).toHaveBeenCalledWith(formatHistory(messages));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints history as json", async () => {
    let panel: CLIState["panel"] = { type: "none" };
    const runtime = {
      runCommand: vi.fn(async () => {
        panel = { type: "history", messages };
      }),
      getState: () => ({ panel }) as CLIState,
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runHistory(runtime, {
      stdout,
      stderr,
    }, {
      output: "json",
    })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatHistoryJson(messages));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints thrown runtime errors as json when requested", async () => {
    const runtime = {
      runCommand: vi.fn(async () => {
        throw new Error("history unavailable");
      }),
      getState: () => ({ panel: { type: "none" } }) as CLIState,
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runHistory(runtime, { stdout, stderr }, { output: "json" })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"history unavailable\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });
});

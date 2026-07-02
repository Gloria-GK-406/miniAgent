import { describe, expect, it, vi } from "vitest";
import { MessageType } from "../core/types.js";
import type { CLIAppRuntime, CLIState } from "./runtime/types.js";
import {
  formatContextPreview,
  formatContextPreviewJson,
  runContextPreview,
} from "./context-preview-runner.js";

const messages = [
  { id: "s1", type: MessageType.System, content: "System prompt" },
  { id: "u1", type: MessageType.User, content: "Hello" },
  {
    id: "a1",
    type: MessageType.Assist,
    content: { type: "text" as const, text: "Hi there" },
  },
];

describe("formatContextPreview", () => {
  it("formats context messages as text", () => {
    expect(formatContextPreview(messages)).toBe([
      "system s1",
      "System prompt",
      "",
      "user u1",
      "Hello",
      "",
      "assist a1",
      "Hi there",
      "",
    ].join("\n"));
  });

  it("formats empty context messages", () => {
    expect(formatContextPreview([])).toBe("No context messages\n");
  });
});

describe("formatContextPreviewJson", () => {
  it("formats context messages as json", () => {
    expect(formatContextPreviewJson(messages)).toContain("\"messages\"");
  });
});

describe("runContextPreview", () => {
  it("runs the context command, prints messages, and destroys the runtime", async () => {
    let panel: CLIState["panel"] = { type: "none" };
    const runtime = {
      runCommand: vi.fn(async () => {
        panel = { type: "context", messages };
      }),
      getState: () => ({ panel }) as CLIState,
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runContextPreview(runtime, { stdout, stderr })).resolves.toBe(0);

    expect(runtime.runCommand).toHaveBeenCalledWith("context", "");
    expect(stdout).toHaveBeenCalledWith(formatContextPreview(messages));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints context messages as json", async () => {
    let panel: CLIState["panel"] = { type: "none" };
    const runtime = {
      runCommand: vi.fn(async () => {
        panel = { type: "context", messages };
      }),
      getState: () => ({ panel }) as CLIState,
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runContextPreview(runtime, {
      stdout,
      stderr,
    }, {
      output: "json",
    })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatContextPreviewJson(messages));
    expect(stderr).not.toHaveBeenCalled();
  });
});

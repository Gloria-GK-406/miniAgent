import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import type { Tool } from "../core/index.js";
import { CLIConfigSchema } from "./config.js";
import type { CLIAppRuntime, CLIState } from "./runtime/types.js";
import {
  formatToolList,
  formatToolListJson,
  runToolList,
  toToolListItem,
} from "./tool-list-runner.js";

const readTool: Tool = {
  name: "read",
  description: "Read a workspace file",
  parameters: z.object({
    path: z.string().describe("File path"),
  }),
  execute: async () => "ok",
};

const shellTool: Tool = {
  name: "shell",
  description: "Run a shell command",
  parameters: z.object({
    command: z.string(),
    timeoutMs: z.number().optional(),
  }),
  execute: async () => "ok",
};

function state(overrides: Partial<CLIState> = {}): CLIState {
  return {
    baseDir: process.cwd(),
    config: CLIConfigSchema.parse({}),
    mode: "build",
    modelName: "openai/fast",
    modelPaths: ["openai/fast"],
    commandSuggestions: [],
    commandHelp: [],
    referencePaths: [],
    inputHistory: [],
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
    exitRequested: false,
    ...overrides,
  };
}

describe("toToolListItem", () => {
  it("converts tool metadata to a serializable item", () => {
    expect(toToolListItem(readTool)).toMatchObject({
      name: "read",
      description: "Read a workspace file",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
          },
        },
        required: ["path"],
      },
    });
  });

  it("includes permission metadata when provided", () => {
    expect(toToolListItem(readTool, {
      decision: "allow",
      reason: "tool rule read",
    })).toMatchObject({
      name: "read",
      permission: {
        decision: "allow",
        reason: "tool rule read",
      },
    });
  });
});

describe("formatToolList", () => {
  it("formats tools as terminal text", () => {
    expect(formatToolList([
      toToolListItem(readTool),
      toToolListItem(shellTool),
    ])).toBe([
      "read - Read a workspace file",
      "shell - Run a shell command",
      "",
    ].join("\n"));
  });

  it("formats an empty tool list", () => {
    expect(formatToolList([])).toBe("No tools available\n");
  });
});

describe("formatToolListJson", () => {
  it("formats tools as json", () => {
    expect(formatToolListJson([toToolListItem(readTool)])).toContain("\"tools\"");
  });
});

describe("runToolList", () => {
  it("prints the runtime tool list and destroys the runtime", async () => {
    const runtime = {
      getState: vi.fn(() => state()),
      listTools: vi.fn(async () => [readTool]),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runToolList(runtime, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith("ALLOW read - Read a workspace file (tool rule read)\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints the runtime tool list as json", async () => {
    const runtime = {
      getState: vi.fn(() => state()),
      listTools: vi.fn(async () => [readTool]),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runToolList(runtime, {
      stdout,
      stderr,
    }, {
      output: "json",
    })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatToolListJson([
      toToolListItem(readTool, { decision: "allow", reason: "tool rule read" }),
    ]));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints mode-aware permission state for headless tool lists", async () => {
    const runtime = {
      getState: vi.fn(() => state({
        mode: "plan",
        autoApprove: true,
        config: CLIConfigSchema.parse({
          permission: { "*": "allow" },
        }),
      })),
      listTools: vi.fn(async () => [readTool, {
        name: "write",
        description: "Write a workspace file",
        parameters: z.object({ path: z.string() }),
        execute: async () => "ok",
      } satisfies Tool]),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runToolList(runtime, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith([
      "ALLOW read - Read a workspace file (global rule *)",
      "ASK write - Write a workspace file (plan mode default write)",
      "",
    ].join("\n"));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints thrown runtime errors as json when requested", async () => {
    const runtime = {
      getState: vi.fn(() => state()),
      listTools: vi.fn(async () => {
        throw new Error("tool registry unavailable");
      }),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runToolList(runtime, { stdout, stderr }, { output: "json" })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"tool registry unavailable\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });
});

import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import type { Tool } from "../tool/types.js";
import type { CLIAppRuntime } from "./runtime/types.js";
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
      listTools: vi.fn(async () => [readTool]),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runToolList(runtime, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith("read - Read a workspace file\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints the runtime tool list as json", async () => {
    const runtime = {
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

    expect(stdout).toHaveBeenCalledWith(formatToolListJson([toToolListItem(readTool)]));
    expect(stderr).not.toHaveBeenCalled();
  });
});

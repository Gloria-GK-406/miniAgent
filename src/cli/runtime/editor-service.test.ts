import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createEditorService,
  resolveEditorInvocation,
} from "./editor-service.js";

describe("resolveEditorInvocation", () => {
  it("uses configured editor before environment defaults", () => {
    const invocation = resolveEditorInvocation({
      config: {
        executable: "code",
        args: ["--wait"],
      },
      env: { EDITOR: "nano" },
      platform: "linux",
      filePath: "draft.md",
    });

    expect(invocation).toEqual({
      command: "code",
      args: ["--wait", "draft.md"],
      filePath: "draft.md",
    });
  });

  it("uses EDITOR when no explicit executable is configured", () => {
    const invocation = resolveEditorInvocation({
      config: {},
      env: { EDITOR: "vim" },
      platform: "linux",
      filePath: "draft.md",
    });

    expect(invocation).toEqual({
      command: "vim",
      args: ["draft.md"],
      filePath: "draft.md",
    });
  });

  it("falls back to a platform editor", () => {
    const invocation = resolveEditorInvocation({
      config: {},
      env: {},
      platform: "win32",
      filePath: "draft.md",
    });

    expect(invocation).toEqual({
      command: "notepad.exe",
      args: ["draft.md"],
      filePath: "draft.md",
    });
  });
});

describe("createEditorService", () => {
  it("writes initial content to a temp file and returns edited content", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "miniagent-editor-test-"));
    const service = createEditorService({
      config: { executable: "fake-editor" },
      tempRoot,
      runner: async (invocation) => {
        const draftPath = invocation.args.at(-1);
        if (draftPath === undefined) {
          throw new Error("Missing draft path");
        }
        await expect(readFile(draftPath, "utf-8")).resolves.toBe("initial prompt");
        await writeFile(draftPath, "edited prompt", "utf-8");
      },
    });

    await expect(service.openEditor("initial prompt")).resolves.toBe("edited prompt");
  });
});

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEntryPrompt } from "./entry-prompt.js";

describe("loadEntryPrompt", () => {
  it("returns the inline prompt when no prompt file is configured", async () => {
    await expect(loadEntryPrompt({
      type: "print",
      prompt: "inline",
    }, process.cwd())).resolves.toBe("inline");
  });

  it("loads a prompt file relative to the entry cwd", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-entry-prompt-"));
    await writeFile(join(baseDir, "task.md"), "from file\n", "utf-8");

    await expect(loadEntryPrompt({
      type: "print",
      promptFile: "task.md",
    }, baseDir)).resolves.toBe("from file");
  });

  it("loads a prompt from stdin when prompt file is dash", async () => {
    await expect(loadEntryPrompt({
      type: "print",
      promptFile: "-",
    }, process.cwd(), {
      readStdin: async () => "from stdin\n",
    })).resolves.toBe("from stdin");
  });
});

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatSystemPromptUpdateResultJson,
  runSystemPromptUpdate,
} from "./system-prompt-runner.js";

describe("formatSystemPromptUpdateResultJson", () => {
  it("formats system prompt updates as json", () => {
    expect(formatSystemPromptUpdateResultJson({
      ok: true,
      action: "set",
      systemPrompt: "Custom prompt.",
    })).toBe([
      "{",
      "  \"ok\": true,",
      "  \"action\": \"set\",",
      "  \"systemPrompt\": \"Custom prompt.\"",
      "}\n",
    ].join("\n"));
  });
});

describe("runSystemPromptUpdate", () => {
  it("sets a project system prompt", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-system-prompt-headless-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSystemPromptUpdate({
      baseDir,
      action: "set",
      prompt: "Custom prompt.",
    }, { stdout, stderr })).resolves.toBe(0);

    await expect(readFile(join(baseDir, ".cliagent", "config.json"), "utf-8"))
      .resolves.toContain("\"systemPrompt\": \"Custom prompt.\"");
    expect(stdout).toHaveBeenCalledWith("Set system prompt\n");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("sets a project system prompt from a file", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-system-prompt-headless-"));
    await writeFile(join(baseDir, "prompt.md"), "File prompt.\n", "utf-8");
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSystemPromptUpdate({
      baseDir,
      action: "set",
      promptFile: "prompt.md",
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatSystemPromptUpdateResultJson({
      ok: true,
      action: "set",
      systemPrompt: "File prompt.",
    }));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("unsets a project system prompt", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-system-prompt-headless-"));
    const stdout = vi.fn();
    const stderr = vi.fn();
    await runSystemPromptUpdate({
      baseDir,
      action: "set",
      prompt: "Temporary prompt.",
    }, { stdout, stderr });

    await expect(runSystemPromptUpdate({
      baseDir,
      action: "unset",
    }, { stdout, stderr })).resolves.toBe(0);

    const config = await readFile(join(baseDir, ".cliagent", "config.json"), "utf-8");
    expect(config).not.toContain("Temporary prompt.");
    expect(stdout).toHaveBeenLastCalledWith("Unset system prompt\n");
  });
});

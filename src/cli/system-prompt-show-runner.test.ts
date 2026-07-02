import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatSystemPromptDisplay,
  formatSystemPromptDisplayJson,
  runSystemPromptShow,
} from "./system-prompt-show-runner.js";

describe("formatSystemPromptDisplay", () => {
  it("formats base and effective prompts for terminal output", () => {
    expect(formatSystemPromptDisplay({
      ok: true,
      mode: "plan",
      basePrompt: "Plan carefully.",
      effectivePrompt: "Plan carefully.\n\nAgent mode: plan",
    })).toBe([
      "System Prompt",
      "Mode: plan",
      "",
      "Base:",
      "Plan carefully.",
      "",
      "Effective:",
      "Plan carefully.",
      "",
      "Agent mode: plan",
      "",
    ].join("\n"));
  });
});

describe("formatSystemPromptDisplayJson", () => {
  it("formats prompt details as json", () => {
    expect(formatSystemPromptDisplayJson({
      ok: true,
      mode: "build",
      basePrompt: "Build safely.",
      effectivePrompt: "Build safely.\n\nAgent mode: build",
    })).toContain("\"mode\": \"build\"");
  });
});

describe("runSystemPromptShow", () => {
  it("prints the effective system prompt", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-system-prompt-show-"));
    await mkdir(join(baseDir, ".cliagent"), { recursive: true });
    await writeFile(join(baseDir, ".cliagent", "config.json"), JSON.stringify({
      providers: [],
      defaultAgent: "plan",
      systemPrompt: "Custom system prompt.",
    }), "utf-8");
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSystemPromptShow({ baseDir }, { stdout, stderr })).resolves.toBe(0);

    const output = stdout.mock.calls[0]?.[0] as string;
    expect(output).toContain("Mode: plan");
    expect(output).toContain("Base:\nCustom system prompt.");
    expect(output).toContain(`Working directory: ${baseDir}`);
    expect(output).toContain("Agent mode: plan");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints the effective system prompt as json for a requested mode", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-system-prompt-show-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSystemPromptShow({
      baseDir,
      mode: "build",
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    const output = stdout.mock.calls[0]?.[0] as string;
    expect(output).toContain("\"ok\": true");
    expect(output).toContain("\"mode\": \"build\"");
    expect(output).toContain("\"basePrompt\"");
    expect(output).toContain("\"effectivePrompt\"");
    expect(stderr).not.toHaveBeenCalled();
  });
});

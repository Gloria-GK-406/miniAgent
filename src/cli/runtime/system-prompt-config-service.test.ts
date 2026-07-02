import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSystemPromptConfigService } from "./system-prompt-config-service.js";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf-8");
}

async function readProjectConfig(baseDir: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(join(baseDir, ".cliagent", "config.json"), "utf-8"),
  ) as Record<string, unknown>;
}

describe("SystemPromptConfigService", () => {
  it("persists a project system prompt", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-system-prompt-"));
    const service = createSystemPromptConfigService(baseDir);

    const next = await service.setSystemPrompt("Custom coding prompt.");

    expect(next.systemPrompt).toBe("Custom coding prompt.");
    await expect(readProjectConfig(baseDir)).resolves.toMatchObject({
      systemPrompt: "Custom coding prompt.",
    });
  });

  it("unsets the project system prompt and reloads defaults", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-system-prompt-unset-"));
    await writeJson(join(baseDir, ".cliagent", "config.json"), {
      systemPrompt: "Temporary prompt.",
    });
    const service = createSystemPromptConfigService(baseDir);

    const next = await service.unsetSystemPrompt();

    expect(next.systemPrompt).toBeUndefined();
    await expect(readProjectConfig(baseDir)).resolves.toEqual({});
  });

  it("rejects empty system prompts", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-system-prompt-empty-"));
    const service = createSystemPromptConfigService(baseDir);

    await expect(service.setSystemPrompt(" \n ")).rejects.toThrow(
      "System prompt cannot be empty",
    );
  });

  it("updates project system prompt config files with a UTF-8 BOM", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-system-prompt-bom-"));
    await mkdir(join(baseDir, ".cliagent"), { recursive: true });
    await writeFile(
      join(baseDir, ".cliagent", "config.json"),
      `\uFEFF${JSON.stringify({ systemPrompt: "Old prompt." })}`,
      "utf-8",
    );
    const service = createSystemPromptConfigService(baseDir);

    const next = await service.setSystemPrompt("New prompt.");

    expect(next.systemPrompt).toBe("New prompt.");
    await expect(readProjectConfig(baseDir)).resolves.toMatchObject({
      systemPrompt: "New prompt.",
    });
  });
});

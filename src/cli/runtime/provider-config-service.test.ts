import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../../core/config.js";
import { CLIConfigSchema } from "../config.js";
import { createProviderConfigService } from "./provider-config-service.js";

async function writeProjectConfig(baseDir: string, value: unknown): Promise<void> {
  await mkdir(join(baseDir, ".cliagent"), { recursive: true });
  await writeFile(join(baseDir, ".cliagent", "config.json"), JSON.stringify(value, null, 2), "utf-8");
}

describe("ProviderConfigService", () => {
  it("writes the first connected provider into project config", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-provider-config-"));
    const service = createProviderConfigService(baseDir);

    const next = await service.connectProvider({
      engine: "openai",
      key: "sk-connected",
      models: [
        {
          id: "fast",
          name: "gpt-4o-mini",
          thinkingLevels: [ThinkingLevel.None],
        },
      ],
      defaultModel: "openai/fast",
    }, CLIConfigSchema.parse({}));

    expect(next.providers).toEqual([
      {
        engine: "openai",
        key: "sk-connected",
        models: [
          {
            id: "fast",
            name: "gpt-4o-mini",
            thinkingLevels: [ThinkingLevel.None],
          },
        ],
      },
    ]);
    expect(next.defaultModel).toBe("openai/fast");
    await expect(readFile(join(baseDir, ".cliagent", "config.json"), "utf-8"))
      .resolves.toContain('"defaultModel": "openai/fast"');
  });

  it("replaces an existing provider and preserves unrelated project config", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-provider-config-"));
    await writeProjectConfig(baseDir, {
      providers: [{
        engine: "openai",
        key: "sk-old",
        models: [{ id: "old", name: "old-model" }],
      }],
      defaultModel: "openai/old",
      permission: {
        read: "deny",
      },
    });
    const service = createProviderConfigService(baseDir);

    const next = await service.connectProvider({
      engine: "openai",
      key: "sk-new",
      models: [{ id: "new", name: "gpt-4o" }],
      defaultModel: "openai/new",
    }, CLIConfigSchema.parse({
      providers: [{
        engine: "openai",
        key: "sk-old",
        models: [{ id: "old", name: "old-model" }],
      }],
      defaultModel: "openai/old",
      permission: {
        read: "deny",
      },
    }));

    expect(next.providers).toEqual([
      {
        engine: "openai",
        key: "sk-new",
        models: [{ id: "new", name: "gpt-4o" }],
      },
    ]);
    expect(next.permission.read).toBe("deny");
    expect(next.defaultModel).toBe("openai/new");
  });

  it("does not copy effective providers that are absent from project config", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-provider-config-"));
    const service = createProviderConfigService(baseDir);

    await service.connectProvider({
      engine: "anthropic",
      key: "sk-local",
      models: [{ id: "claude", name: "claude" }],
      defaultModel: "anthropic/claude",
    }, CLIConfigSchema.parse({
      providers: [{
        engine: "openai",
        key: "sk-global",
        models: [{ id: "global", name: "global-model" }],
      }],
      defaultModel: "openai/global",
    }));

    const saved = await readFile(join(baseDir, ".cliagent", "config.json"), "utf-8");
    expect(saved).toContain("sk-local");
    expect(saved).not.toContain("sk-global");
  });
});

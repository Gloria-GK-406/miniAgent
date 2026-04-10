import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AgentConfigResolver,
  AgentConfigService,
  PersistentConfigAggregator,
  PersistentConfigFileLoader,
} from "./index.js";
import type { PersistConfig } from "../../core/config.js";

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "miniagent-config-test-"));
}

describe("config service", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("loads files in order and resolves the active model group", async () => {
    const dir = await createTempDir();
    tempDirs.push(dir);

    const globalPath = join(dir, "global.json");
    const localPath = join(dir, "local.json");

    await writeFile(
      globalPath,
      JSON.stringify({
        defaultModel: "general",
        models: {
          general: {
            models: [
              {
                provider: "openai-compatible",
                model: "gpt-global",
                apiKey: "global-key",
              },
            ],
          },
          backup: {
            models: [
              {
                provider: "glm",
                model: "glm-4.5",
                apiKey: "backup-key",
              },
            ],
          },
        },
        plugins: {
          search: {
            enabled: true,
          },
          retries: 2,
        },
      }),
      "utf-8",
    );

    await writeFile(
      localPath,
      JSON.stringify({
        models: {
          general: {
            models: [
              {
                provider: "openai-compatible",
                model: "gpt-local",
                apiKey: "local-key",
                temperature: 0.2,
              },
              {
                provider: "openai-compatible",
                model: "gpt-fallback",
                apiKey: "local-fallback-key",
              },
            ],
          },
        },
        plugins: {
          search: {
            enabled: false,
          },
        },
      }),
      "utf-8",
    );

    const config = await AgentConfigService.loadFromFiles(
      [globalPath, localPath],
      {
        paths: {
          sessiondir: "/tmp/session",
        },
      },
    );

    expect(config.model.model).toBe("gpt-local");
    expect(config.model.apiKey).toBe("local-key");
    expect(config.models.get("general")?.models).toHaveLength(2);
    expect(config.models.get("backup")?.models[0]?.model).toBe("glm-4.5");
    expect(config.plugins.get("retries")).toBe(2);
    expect(config.plugins.get("search")).toEqual({ enabled: false });
  });

  it("prefers runtime.activeModel over persist.defaultModel", () => {
    const persist: PersistConfig = {
      defaultModel: "general",
      models: {
        general: {
          models: [
            {
              provider: "openai-compatible",
              model: "gpt-general",
              apiKey: "general-key",
            },
          ],
        },
        reasoning: {
          models: [
            {
              provider: "anthropic",
              model: "claude-opus",
              apiKey: "reasoning-key",
            },
          ],
        },
      },
      plugins: {},
    };

    const config = AgentConfigResolver.resolve(persist, {
      activeModel: "reasoning",
      paths: {
        sessiondir: "/tmp/runtime",
      },
    });

    expect(config.model.model).toBe("claude-opus");
    expect(config.models.get("general")?.models[0]?.model).toBe("gpt-general");
  });

  it("merges persist configs by top-level key and replaces colliding model groups", () => {
    const merged = PersistentConfigAggregator.aggregate([
      {
        defaultModel: "general",
        models: {
          general: {
            models: [
              {
                provider: "openai-compatible",
                model: "gpt-global",
                apiKey: "global-key",
              },
            ],
          },
        },
        plugins: {
          search: { enabled: true },
          retries: 1,
        },
      },
      {
        models: {
          general: {
            models: [
              {
                provider: "openai-compatible",
                model: "gpt-local",
                apiKey: "local-key",
              },
            ],
          },
        },
        plugins: {
          retries: 3,
        },
      },
    ]);

    expect(merged.defaultModel).toBe("general");
    expect(merged.models.general.models[0]?.model).toBe("gpt-local");
    expect(merged.plugins).toEqual({
      search: { enabled: true },
      retries: 3,
    });
  });

  it("includes file path in validation errors", async () => {
    const dir = await createTempDir();
    tempDirs.push(dir);

    const invalidPath = join(dir, "invalid.json");
    await writeFile(
      invalidPath,
      JSON.stringify({
        models: {
          broken: {
            models: [],
          },
        },
      }),
      "utf-8",
    );

    await expect(PersistentConfigFileLoader.loadFile(invalidPath)).rejects.toThrow(invalidPath);
  });
});

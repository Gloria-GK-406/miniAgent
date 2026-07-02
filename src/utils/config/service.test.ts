import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AgentConfigService,
  PersistentConfigFileLoader,
} from "./index.js";

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "miniagent-config-test-"));
}

describe("config service", () => {
  const tempDirs: string[] = [];
  let tempDir: string;
  let service: AgentConfigService;

  async function writeConfig(name: string, config: unknown): Promise<void> {
    await writeFile(join(tempDir, name), JSON.stringify(config), "utf-8");
  }

  beforeEach(async () => {
    tempDir = await createTempDir();
    tempDirs.push(tempDir);
    service = new AgentConfigService();
  });

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("merges provider-mode configs and lets runtime activeModel override defaultModel", async () => {
    await writeConfig("base.json", {
      providers: [
        {
          provider: "openai",
          key: "base-key",
          models: [
            { id: "slow", name: "gpt-4o" },
            { id: "fast", name: "gpt-4o-mini" },
          ],
        },
      ],
      defaultModel: "slow",
      generation: { temperature: 0.2, thinking: "low" },
    });

    const result = await service.load({
      configFiles: [join(tempDir, "base.json")],
      runtime: {
        activeModel: "fast",
        paths: { sessiondir: tempDir },
      },
    });

    expect(result.agentConfig.providers).toHaveLength(1);
    expect(result.agentConfig.defaultModel).toEqual({ id: "fast" });
    expect(result.agentConfig.generation).toMatchObject({
      temperature: 0.2,
      thinking: "low",
    });
    expect(result.agentConfig.paths.sessiondir).toBe(tempDir);
  });

  it("replaces duplicate providers by name during aggregation", async () => {
    await writeConfig("base.json", {
      providers: [{ provider: "openai", key: "old-key" }],
    });
    await writeConfig("override.json", {
      providers: [{ provider: "openai", key: "new-key" }],
    });

    const result = await service.load({
      configFiles: [join(tempDir, "base.json"), join(tempDir, "override.json")],
      runtime: { paths: { sessiondir: tempDir } },
    });

    expect(result.agentConfig.providers).toEqual([
      expect.objectContaining({ provider: "openai", key: "new-key" }),
    ]);
  });

  it("shallow-merges generation config during aggregation", async () => {
    await writeConfig("base.json", {
      generation: { temperature: 0.2, thinking: "low" },
    });
    await writeConfig("override.json", {
      generation: { topP: 0.8 },
    });

    const result = await service.load({
      configFiles: [join(tempDir, "base.json"), join(tempDir, "override.json")],
      runtime: { paths: { sessiondir: tempDir } },
    });

    expect(result.agentConfig.generation).toMatchObject({
      temperature: 0.2,
      thinking: "low",
      topP: 0.8,
    });
  });

  it("normalizes persisted plugin records to a Map and lets later entries override earlier entries", async () => {
    await writeConfig("base.json", {
      plugins: {
        alpha: { enabled: true },
        shared: "base",
      },
    });
    await writeConfig("override.json", {
      plugins: {
        shared: "override",
        beta: 2,
      },
    });

    const result = await service.load({
      configFiles: [join(tempDir, "base.json"), join(tempDir, "override.json")],
      runtime: { paths: { sessiondir: tempDir } },
    });

    expect(result.agentConfig.plugins).toBeInstanceOf(Map);
    expect(result.agentConfig.plugins.get("alpha")).toEqual({ enabled: true });
    expect(result.agentConfig.plugins.get("shared")).toBe("override");
    expect(result.agentConfig.plugins.get("beta")).toBe(2);
  });

  it("includes file path in validation errors", async () => {
    const invalidPath = join(tempDir, "invalid.json");
    await writeConfig("invalid.json", {
      models: {
        broken: {
          models: [],
        },
      },
    });

    await expect(PersistentConfigFileLoader.loadFile(invalidPath)).rejects.toThrow(invalidPath);
  });
});

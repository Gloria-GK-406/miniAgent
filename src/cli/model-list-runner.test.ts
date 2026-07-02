import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatModelList,
  formatModelListJson,
  listConfiguredModels,
  runModelList,
} from "./model-list-runner.js";

async function writeConfig(baseDir: string, config: unknown): Promise<void> {
  await mkdir(join(baseDir, ".cliagent"), { recursive: true });
  await writeFile(join(baseDir, ".cliagent", "config.json"), JSON.stringify(config, null, 2), "utf-8");
}

const config = {
  providers: [
    {
      engine: "openai",
      key: "sk-test",
      models: [
        { id: "fast", name: "gpt-fast", displayName: "Fast" },
        { id: "deep", name: "gpt-deep" },
      ],
    },
  ],
  defaultModel: "openai/fast",
};

describe("listConfiguredModels", () => {
  it("lists configured models with default markers", () => {
    expect(listConfiguredModels(config)).toEqual([
      {
        selector: "openai/fast",
        provider: "openai",
        id: "fast",
        name: "gpt-fast",
        displayName: "Fast",
        default: true,
      },
      {
        selector: "openai/deep",
        provider: "openai",
        id: "deep",
        name: "gpt-deep",
        default: false,
      },
    ]);
  });
});

describe("formatModelList", () => {
  it("formats configured models as text", () => {
    expect(formatModelList(listConfiguredModels(config))).toBe([
      "* openai/fast - Fast",
      "  openai/deep - gpt-deep",
      "",
    ].join("\n"));
  });

  it("formats empty model lists", () => {
    expect(formatModelList([])).toBe("No models configured\n");
  });
});

describe("formatModelListJson", () => {
  it("formats configured models as json", () => {
    expect(formatModelListJson("openai/fast", listConfiguredModels(config))).toContain("\"defaultModel\": \"openai/fast\"");
  });
});

describe("runModelList", () => {
  it("prints configured models", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-list-models-"));
    await writeConfig(baseDir, config);
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runModelList({ baseDir }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("openai/fast"));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints configured models as json", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-list-models-"));
    await writeConfig(baseDir, config);
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runModelList({
      baseDir,
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("\"models\""));
    expect(stderr).not.toHaveBeenCalled();
  });
});

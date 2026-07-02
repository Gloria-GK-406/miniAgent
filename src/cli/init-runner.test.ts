import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatInitConfigResultJson,
  runInitConfig,
} from "./init-runner.js";

describe("formatInitConfigResultJson", () => {
  it("formats init results as json", () => {
    expect(formatInitConfigResultJson({
      ok: true,
      configPath: "C:/repo/.cliagent/config.json",
      overwritten: false,
    })).toBe([
      "{",
      "  \"ok\": true,",
      "  \"configPath\": \"C:/repo/.cliagent/config.json\",",
      "  \"overwritten\": false",
      "}\n",
    ].join("\n"));
  });
});

describe("runInitConfig", () => {
  it("creates a project config template", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-init-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runInitConfig({ baseDir }, { stdout, stderr })).resolves.toBe(0);

    const configPath = join(baseDir, ".cliagent", "config.json");
    await expect(readFile(configPath, "utf-8")).resolves.toContain("\"defaultAgent\": \"build\"");
    expect(stdout).toHaveBeenCalledWith(`Created config ${configPath}\n`);
    expect(stderr).not.toHaveBeenCalled();
  });

  it("refuses to overwrite existing config without force", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-init-"));
    const configPath = join(baseDir, ".cliagent", "config.json");
    const stdout = vi.fn();
    const stderr = vi.fn();
    await runInitConfig({ baseDir }, { stdout, stderr });

    await expect(runInitConfig({ baseDir }, { stdout, stderr })).resolves.toBe(1);

    expect(stderr).toHaveBeenCalledWith(`Config already exists: ${configPath}\n`);
  });

  it("overwrites existing config with force and prints json", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-init-"));
    const configPath = join(baseDir, ".cliagent", "config.json");
    const stdout = vi.fn();
    const stderr = vi.fn();
    await runInitConfig({ baseDir }, { stdout, stderr });
    await writeFile(configPath, "{}", "utf-8");

    await expect(runInitConfig({
      baseDir,
      force: true,
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenLastCalledWith(formatInitConfigResultJson({
      ok: true,
      configPath,
      overwritten: true,
    }));
    await expect(readFile(configPath, "utf-8")).resolves.toContain("\"defaultAgent\": \"build\"");
  });
});

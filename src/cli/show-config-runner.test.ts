import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatShowConfigJson,
  runShowConfig,
} from "./show-config-runner.js";

describe("formatShowConfigJson", () => {
  it("formats config as pretty json", () => {
    expect(formatShowConfigJson({
      providers: [],
      defaultModel: "",
    })).toBe([
      "{",
      "  \"providers\": [],",
      "  \"defaultModel\": \"\"",
      "}\n",
    ].join("\n"));
  });
});

describe("runShowConfig", () => {
  it("prints the effective config without creating a missing config file", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-show-config-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runShowConfig({
      baseDir,
      platform: "linux",
      env: {},
      homeDir: baseDir,
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("\"defaultAgent\": \"build\""));
    expect(stderr).not.toHaveBeenCalled();
    await expect(readFile(join(baseDir, ".cliagent", "config.json"), "utf-8")).rejects.toThrow();
  });

  it("prints merged config as json", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-show-config-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runShowConfig({
      baseDir,
      output: "json",
      platform: "linux",
      env: {},
      homeDir: baseDir,
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("\"providers\": []"));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints config load errors as json when requested", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-show-config-"));
    await mkdir(join(baseDir, ".cliagent"), { recursive: true });
    await writeFile(join(baseDir, ".cliagent", "config.json"), "{", "utf-8");
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runShowConfig({
      baseDir,
      output: "json",
      platform: "linux",
      env: {},
      homeDir: baseDir,
    }, { stdout, stderr })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("\"ok\": false"));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("\"error\""));
    expect(stderr).not.toHaveBeenCalled();
  });
});

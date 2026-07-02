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

  it("redacts sensitive config values", () => {
    const output = formatShowConfigJson({
      providers: [{
        engine: "openai",
        key: "sk-secret",
        models: [],
      }],
      nested: {
        token: "token-secret",
      },
    });

    expect(output).toContain("\"key\": \"<redacted>\"");
    expect(output).toContain("\"token\": \"<redacted>\"");
    expect(output).not.toContain("sk-secret");
    expect(output).not.toContain("token-secret");
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

  it("prints the effective config with provider keys redacted", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-show-config-"));
    await mkdir(join(baseDir, ".cliagent"), { recursive: true });
    await writeFile(join(baseDir, ".cliagent", "config.json"), JSON.stringify({
      providers: [{
        engine: "openai",
        key: "sk-secret",
        models: [{ id: "fast", name: "gpt-4o-mini" }],
      }],
      defaultModel: "openai/fast",
    }), "utf-8");
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runShowConfig({
      baseDir,
      output: "json",
      platform: "linux",
      env: {},
      homeDir: baseDir,
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("\"key\": \"<redacted>\""));
    expect(stdout).not.toHaveBeenCalledWith(expect.stringContaining("sk-secret"));
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

  it("prints config schema errors as json when requested", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-show-config-"));
    await mkdir(join(baseDir, ".cliagent"), { recursive: true });
    await writeFile(join(baseDir, ".cliagent", "config.json"), JSON.stringify({
      defaultAgent: "review",
    }), "utf-8");
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
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("Invalid config file"));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("defaultAgent"));
    expect(stderr).not.toHaveBeenCalled();
  });
});

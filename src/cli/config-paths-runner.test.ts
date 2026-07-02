import { describe, expect, it, vi } from "vitest";
import {
  formatConfigPaths,
  formatConfigPathsJson,
  resolveConfigPaths,
  runConfigPaths,
} from "./config-paths-runner.js";

const paths = {
  projectConfigPath: "C:/repo/.cliagent/config.json",
  globalConfigPath: "C:/Users/Test/AppData/Roaming/miniagent/config.json",
};

describe("resolveConfigPaths", () => {
  it("resolves project and global config paths", () => {
    expect(resolveConfigPaths("C:/repo", {
      platform: "win32",
      env: { APPDATA: "C:/Users/Test/AppData/Roaming" },
      homeDir: "C:/Users/Test",
    }).projectConfigPath.replaceAll("\\", "/")).toBe("C:/repo/.cliagent/config.json");
  });
});

describe("formatConfigPaths", () => {
  it("formats config paths as plain text", () => {
    expect(formatConfigPaths(paths)).toBe([
      "Project config: C:/repo/.cliagent/config.json",
      "Global config: C:/Users/Test/AppData/Roaming/miniagent/config.json",
      "",
    ].join("\n"));
  });
});

describe("formatConfigPathsJson", () => {
  it("formats config paths as json", () => {
    expect(formatConfigPathsJson(paths)).toBe([
      "{",
      "  \"projectConfigPath\": \"C:/repo/.cliagent/config.json\",",
      "  \"globalConfigPath\": \"C:/Users/Test/AppData/Roaming/miniagent/config.json\"",
      "}\n",
    ].join("\n"));
  });
});

describe("runConfigPaths", () => {
  it("prints text config paths", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    expect(runConfigPaths({
      baseDir: "C:/repo",
      platform: "win32",
      env: { APPDATA: "C:/Users/Test/AppData/Roaming" },
      homeDir: "C:/Users/Test",
    }, { stdout, stderr })).toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("Project config:"));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints json config paths", () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    expect(runConfigPaths({
      baseDir: "C:/repo",
      output: "json",
      platform: "win32",
      env: { APPDATA: "C:/Users/Test/AppData/Roaming" },
      homeDir: "C:/Users/Test",
    }, { stdout, stderr })).toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("\"projectConfigPath\""));
    expect(stderr).not.toHaveBeenCalled();
  });
});

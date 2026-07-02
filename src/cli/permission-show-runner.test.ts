import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatPermissionPolicy,
  formatPermissionPolicyJson,
  runPermissionShow,
} from "./permission-show-runner.js";

describe("formatPermissionPolicy", () => {
  it("formats flat and nested permission rules for terminal output", () => {
    expect(formatPermissionPolicy({
      "*": "ask",
      read: "allow",
      shell: {
        "*": "ask",
        "npm *": "allow",
        "rm -rf *": "deny",
      },
    })).toBe([
      "Permissions",
      "*: ask",
      "read: allow",
      "shell:",
      "  *: ask",
      "  npm *: allow",
      "  rm -rf *: deny",
      "",
    ].join("\n"));
  });
});

describe("formatPermissionPolicyJson", () => {
  it("formats permissions as json", () => {
    expect(formatPermissionPolicyJson({
      "*": "ask",
      read: "allow",
    })).toBe([
      "{",
      "  \"ok\": true,",
      "  \"permission\": {",
      "    \"*\": \"ask\",",
      "    \"read\": \"allow\"",
      "  }",
      "}\n",
    ].join("\n"));
  });
});

describe("runPermissionShow", () => {
  it("prints the effective permission policy", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-permission-show-"));
    await mkdir(join(baseDir, ".cliagent"), { recursive: true });
    await writeFile(join(baseDir, ".cliagent", "config.json"), JSON.stringify({
      providers: [],
      permission: {
        "*": "ask",
        read: "allow",
        shell: {
          "*": "ask",
          "npm *": "allow",
        },
      },
    }), "utf-8");
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runPermissionShow({ baseDir }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatPermissionPolicy({
      "*": "ask",
      read: "allow",
      shell: {
        "*": "ask",
        "npm *": "allow",
      },
    }));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints the effective permission policy as json", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-permission-show-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runPermissionShow({
      baseDir,
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout.mock.calls[0]?.[0]).toContain("\"ok\": true");
    expect(stdout.mock.calls[0]?.[0]).toContain("\"permission\"");
    expect(stderr).not.toHaveBeenCalled();
  });
});

import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatPermissionUpdateResultJson,
  runPermissionUpdate,
} from "./permission-runner.js";

describe("formatPermissionUpdateResultJson", () => {
  it("formats permission updates as json", () => {
    expect(formatPermissionUpdateResultJson({
      ok: true,
      action: "set",
      target: "write",
      decision: "deny",
    })).toBe([
      "{",
      "  \"ok\": true,",
      "  \"action\": \"set\",",
      "  \"target\": \"write\",",
      "  \"decision\": \"deny\"",
      "}\n",
    ].join("\n"));
  });
});

describe("runPermissionUpdate", () => {
  it("sets a project permission rule", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-permission-headless-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runPermissionUpdate({
      baseDir,
      action: "set",
      target: "write",
      decision: "deny",
    }, { stdout, stderr })).resolves.toBe(0);

    await expect(readFile(join(baseDir, ".cliagent", "config.json"), "utf-8"))
      .resolves.toContain("\"write\": \"deny\"");
    expect(stdout).toHaveBeenCalledWith("Set permission write to deny\n");
    expect(stderr).not.toHaveBeenCalled();
  });

  it("sets a nested pattern rule and prints json", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-permission-headless-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runPermissionUpdate({
      baseDir,
      action: "set",
      target: "shell:npm *",
      decision: "allow",
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatPermissionUpdateResultJson({
      ok: true,
      action: "set",
      target: "shell:npm *",
      decision: "allow",
    }));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("unsets a project permission rule", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-permission-headless-"));
    const stdout = vi.fn();
    const stderr = vi.fn();
    await runPermissionUpdate({
      baseDir,
      action: "set",
      target: "write",
      decision: "deny",
    }, { stdout, stderr });

    await expect(runPermissionUpdate({
      baseDir,
      action: "unset",
      target: "write",
    }, { stdout, stderr })).resolves.toBe(0);

    const config = await readFile(join(baseDir, ".cliagent", "config.json"), "utf-8");
    expect(config).not.toContain("\"write\": \"deny\"");
    expect(stdout).toHaveBeenLastCalledWith("Unset permission write\n");
  });
});

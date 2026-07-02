import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatProjectInstructionsInitJson,
  runProjectInstructionsInit,
} from "./project-instructions-runner.js";

describe("formatProjectInstructionsInitJson", () => {
  it("formats project instructions init results as json", () => {
    expect(formatProjectInstructionsInitJson({
      ok: true,
      path: "C:/repo/AGENTS.md",
      written: true,
    })).toBe([
      "{",
      "  \"ok\": true,",
      "  \"path\": \"C:/repo/AGENTS.md\",",
      "  \"written\": true",
      "}\n",
    ].join("\n"));
  });
});

describe("runProjectInstructionsInit", () => {
  it("writes AGENTS.md for the project", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-init-instructions-"));
    await mkdir(join(baseDir, "src"), { recursive: true });
    await writeFile(join(baseDir, "package.json"), JSON.stringify({
      name: "demo",
      scripts: { test: "vitest run" },
      devDependencies: { typescript: "^6.0.0" },
    }), "utf-8");
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runProjectInstructionsInit({ baseDir }, { stdout, stderr })).resolves.toBe(0);

    const path = join(baseDir, "AGENTS.md");
    await expect(readFile(path, "utf-8")).resolves.toContain("# demo");
    expect(stdout).toHaveBeenCalledWith(`Wrote project instructions ${path}\n`);
    expect(stderr).not.toHaveBeenCalled();
  });

  it("does not overwrite existing AGENTS.md without force", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-init-instructions-"));
    const path = join(baseDir, "AGENTS.md");
    await writeFile(path, "existing", "utf-8");
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runProjectInstructionsInit({ baseDir }, { stdout, stderr })).resolves.toBe(0);

    await expect(readFile(path, "utf-8")).resolves.toBe("existing");
    expect(stdout).toHaveBeenCalledWith(`Project instructions already exist ${path}\n`);
    expect(stderr).not.toHaveBeenCalled();
  });

  it("overwrites existing AGENTS.md with force and prints json", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-init-instructions-"));
    const path = join(baseDir, "AGENTS.md");
    await writeFile(path, "existing", "utf-8");
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runProjectInstructionsInit({
      baseDir,
      force: true,
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatProjectInstructionsInitJson({
      ok: true,
      path,
      written: true,
    }));
    await expect(readFile(path, "utf-8")).resolves.not.toBe("existing");
    expect(stderr).not.toHaveBeenCalled();
  });
});

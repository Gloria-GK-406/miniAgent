import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatGitHeadlessResultJson,
  runGitHeadless,
} from "./git-headless-runner.js";

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

function runGit(cwd: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(stderr || stdout || `git ${args.join(" ")} failed`));
        return;
      }
      resolve({ stdout, stderr, exitCode });
    });
  });
}

async function setupRepo(): Promise<string> {
  const baseDir = await mkdtemp(join(tmpdir(), "miniagent-git-headless-"));
  await runGit(baseDir, ["init"]);
  await runGit(baseDir, ["config", "user.email", "test@example.com"]);
  await runGit(baseDir, ["config", "user.name", "MiniAgent Test"]);
  await writeFile(join(baseDir, "a.txt"), "one\n", "utf-8");
  await runGit(baseDir, ["add", "a.txt"]);
  await runGit(baseDir, ["commit", "-m", "initial commit"]);
  await writeFile(join(baseDir, "a.txt"), "two\n", "utf-8");
  return baseDir;
}

describe("formatGitHeadlessResultJson", () => {
  it("formats git headless results as json", () => {
    expect(formatGitHeadlessResultJson({
      ok: true,
      action: "status",
      content: " M a.txt\n",
    })).toBe([
      "{",
      "  \"ok\": true,",
      "  \"action\": \"status\",",
      "  \"content\": \" M a.txt\\n\"",
      "}\n",
    ].join("\n"));
  });
});

describe("runGitHeadless", () => {
  it("prints git status text", async () => {
    const baseDir = await setupRepo();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runGitHeadless({ baseDir, action: "status" }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("M a.txt"));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints git log as json", async () => {
    const baseDir = await setupRepo();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runGitHeadless({
      baseDir,
      action: "log",
      limit: 1,
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("\"action\": \"log\""));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("initial commit"));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints a path-scoped git diff", async () => {
    const baseDir = await setupRepo();
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runGitHeadless({
      baseDir,
      action: "diff",
      path: "a.txt",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("-one"));
    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("+two"));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints a friendly error outside git repositories", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-git-headless-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runGitHeadless({ baseDir, action: "status" }, { stdout, stderr })).resolves.toBe(1);

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith("Not a git repository\n");
  });
});

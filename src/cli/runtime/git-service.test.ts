import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createGitService } from "./git-service.js";

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
  const baseDir = await mkdtemp(join(tmpdir(), "miniagent-git-service-"));
  await runGit(baseDir, ["init"]);
  await runGit(baseDir, ["config", "user.email", "test@example.com"]);
  await runGit(baseDir, ["config", "user.name", "MiniAgent Test"]);
  await writeFile(join(baseDir, "a.txt"), "one\n", "utf-8");
  await runGit(baseDir, ["add", "a.txt"]);
  await runGit(baseDir, ["commit", "-m", "initial commit"]);
  return baseDir;
}

describe("GitService", () => {
  it("detects repositories and returns short status", async () => {
    const baseDir = await setupRepo();
    await writeFile(join(baseDir, "a.txt"), "two\n", "utf-8");
    const service = createGitService(baseDir);

    await expect(service.isRepository()).resolves.toBe(true);
    await expect(service.statusShort()).resolves.toContain("M a.txt");
  });

  it("returns a path-scoped diff", async () => {
    const baseDir = await setupRepo();
    await writeFile(join(baseDir, "a.txt"), "two\n", "utf-8");
    const service = createGitService(baseDir);

    const diff = await service.diff({ path: "a.txt" });

    expect(diff).toContain("-one");
    expect(diff).toContain("+two");
  });

  it("returns git log subjects", async () => {
    const baseDir = await setupRepo();
    const service = createGitService(baseDir);

    await expect(service.log({ limit: 1 })).resolves.toContain("initial commit");
  });

  it("rejects empty commit messages", async () => {
    const baseDir = await setupRepo();
    const service = createGitService(baseDir);

    await expect(service.commit("   ")).rejects.toThrow("Commit message cannot be empty");
  });
});

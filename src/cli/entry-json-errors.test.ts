import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function runCLI(args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--import",
      "tsx",
      "src/cli/index.tsx",
      ...args,
    ], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
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
      resolve({ exitCode, stdout, stderr });
    });
  });
}

describe("CLI entry json parse errors", () => {
  it("prints parse errors as json when --json is present", async () => {
    const result = await runCLI(["--json", "--missing"]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("{\n  \"ok\": false,\n  \"error\": \"Unknown argument: --missing\"\n}\n");
    expect(result.stderr).toBe("");
  }, 20_000);
});

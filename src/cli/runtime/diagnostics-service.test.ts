import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDiagnosticsService } from "./diagnostics-service.js";
import type { ShellService } from "./shell-service.js";

async function createWorkspace(scripts: Record<string, string>): Promise<string> {
  const baseDir = await mkdtemp(join(tmpdir(), "miniagent-diagnostics-"));
  await writeFile(join(baseDir, "package.json"), JSON.stringify({ scripts }), "utf-8");
  return baseDir;
}

describe("createDiagnosticsService", () => {
  it("discovers TypeScript, lint, and test commands from package scripts", async () => {
    const baseDir = await createWorkspace({
      typecheck: "tsc --noEmit",
      lint: "eslint src",
      test: "vitest run",
      build: "tsc",
    });
    const shellService: ShellService = {
      execute: vi.fn(async () => ({
        stdout: "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        aborted: false,
      })),
    };
    const service = createDiagnosticsService({
      baseDir,
      config: {},
      shellService,
    });

    await expect(service.discoverCommands()).resolves.toEqual([
      "npm run typecheck",
      "npm run lint",
      "npm test",
    ]);
  });

  it("uses configured commands before package script discovery", async () => {
    const baseDir = await createWorkspace({
      lint: "eslint src",
    });
    const shellService: ShellService = {
      execute: vi.fn(async () => ({
        stdout: "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        aborted: false,
      })),
    };
    const service = createDiagnosticsService({
      baseDir,
      config: { commands: ["npm run custom"] },
      shellService,
    });

    await expect(service.discoverCommands()).resolves.toEqual(["npm run custom"]);
  });

  it("runs diagnostics and captures command results", async () => {
    const baseDir = await createWorkspace({});
    const shellService: ShellService = {
      execute: vi.fn(async () => ({
        stdout: "ok",
        stderr: "warn",
        exitCode: 1,
        timedOut: false,
        aborted: false,
      })),
    };
    const service = createDiagnosticsService({
      baseDir,
      config: {
        commands: ["npm run lint"],
        timeoutMs: 1234,
      },
      shellService,
    });

    await expect(service.runDiagnostics()).resolves.toEqual([
      {
        command: "npm run lint",
        stdout: "ok",
        stderr: "warn",
        exitCode: 1,
        timedOut: false,
        aborted: false,
      },
    ]);
    expect(shellService.execute).toHaveBeenCalledWith({
      command: "npm run lint",
      cwd: baseDir,
      timeoutMs: 1234,
    });
  });
});

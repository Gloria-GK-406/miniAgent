import { describe, expect, it } from "vitest";
import { buildShellInvocation, createShellService } from "./shell-service.js";

describe("buildShellInvocation", () => {
  it("uses PowerShell on Windows by default", () => {
    expect(buildShellInvocation("echo hi", { windows: "powershell", timeoutMs: 120000 }, "win32"))
      .toEqual({
        command: "powershell.exe",
        args: ["-NoLogo", "-NoProfile", "-Command", "echo hi"],
      });
  });

  it("uses sh on non-Windows by default", () => {
    expect(buildShellInvocation("echo hi", { windows: "powershell", timeoutMs: 120000 }, "linux"))
      .toEqual({
        command: "/bin/sh",
        args: ["-c", "echo hi"],
      });
  });

  it("honors explicit executable and args", () => {
    expect(buildShellInvocation("echo hi", {
      windows: "powershell",
      executable: "pwsh",
      args: ["-Command"],
      timeoutMs: 120000,
    }, "win32")).toEqual({
      command: "pwsh",
      args: ["-Command", "echo hi"],
    });
  });
});

describe("ShellService", () => {
  it("runs a simple command", async () => {
    const service = createShellService({
      windows: "powershell",
      timeoutMs: 120000,
    });

    const result = await service.execute({
      command: process.platform === "win32" ? "Write-Output shell-ok" : "printf shell-ok",
      cwd: process.cwd(),
    });

    expect(result.stdout + result.stderr).toContain("shell-ok");
    expect(result.exitCode).toBe(0);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createPermissionService } from "../runtime/permission-service.js";
import type { DiagnosticsService } from "../runtime/diagnostics-service.js";
import { createDiagnosticsToolkit } from "./diagnostics-toolkit.js";

function createMockDiagnosticsService(): DiagnosticsService {
  return {
    discoverCommands: vi.fn(async () => ["npm run lint"]),
    runDiagnostics: vi.fn(async () => [
      {
        command: "npm run lint",
        stdout: "lint ok\n",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        aborted: false,
      },
      {
        command: "npm test",
        stdout: "",
        stderr: "failed test\nstack",
        exitCode: 1,
        timedOut: false,
        aborted: false,
      },
    ]),
  };
}

describe("createDiagnosticsToolkit", () => {
  it("exposes a diagnostics tool that formats pass and fail results", async () => {
    const diagnosticsService = createMockDiagnosticsService();
    const toolkit = createDiagnosticsToolkit({
      diagnosticsService,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
    });

    expect(toolkit.tools.map((tool) => tool.name)).toEqual(["diagnostics"]);

    await expect(toolkit.tools[0]!.execute({})).resolves.toBe([
      "FAIL diagnostics",
      "PASS npm run lint - lint ok",
      "FAIL npm test - failed test",
    ].join("\n"));
    expect(diagnosticsService.runDiagnostics).toHaveBeenCalledTimes(1);
  });

  it("asks permission before running diagnostics", async () => {
    const diagnosticsService = createMockDiagnosticsService();
    const requestApproval = vi.fn(async () => false);
    const toolkit = createDiagnosticsToolkit({
      diagnosticsService,
      permissionService: createPermissionService({ "*": "allow", diagnostics: "ask" }),
      getAutoApprove: () => false,
      requestApproval,
    });

    await expect(toolkit.tools[0]!.execute({}))
      .rejects.toThrow("Permission rejected for diagnostics");
    expect(requestApproval).toHaveBeenCalledWith("diagnostics", {});
    expect(diagnosticsService.runDiagnostics).not.toHaveBeenCalled();
  });

  it("reports when no diagnostics are configured", async () => {
    const diagnosticsService: DiagnosticsService = {
      discoverCommands: vi.fn(async () => []),
      runDiagnostics: vi.fn(async () => []),
    };
    const toolkit = createDiagnosticsToolkit({
      diagnosticsService,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
    });

    await expect(toolkit.tools[0]!.execute({}))
      .resolves.toBe("No diagnostics configured");
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  formatDiagnosticsJson,
  formatDiagnosticsText,
  runHeadlessDiagnostics,
} from "./diagnostics-runner.js";

const passResult = {
  command: "npm run lint",
  stdout: "ok\n",
  stderr: "",
  exitCode: 0,
  timedOut: false,
  aborted: false,
};

const failResult = {
  command: "npm test",
  stdout: "",
  stderr: "failed\n",
  exitCode: 1,
  timedOut: false,
  aborted: false,
};

describe("formatDiagnosticsText", () => {
  it("formats diagnostic command results for terminals", () => {
    expect(formatDiagnosticsText([passResult, failResult])).toBe([
      "PASS npm run lint - ok",
      "FAIL npm test - failed",
      "",
    ].join("\n"));
  });

  it("formats an empty diagnostics list", () => {
    expect(formatDiagnosticsText([])).toBe("No diagnostics configured\n");
  });
});

describe("formatDiagnosticsJson", () => {
  it("formats diagnostics with an ok flag", () => {
    expect(formatDiagnosticsJson([passResult, failResult])).toBe([
      "{",
      "  \"ok\": false,",
      "  \"results\": [",
      "    {",
      "      \"command\": \"npm run lint\",",
      "      \"stdout\": \"ok\\n\",",
      "      \"stderr\": \"\",",
      "      \"exitCode\": 0,",
      "      \"timedOut\": false,",
      "      \"aborted\": false",
      "    },",
      "    {",
      "      \"command\": \"npm test\",",
      "      \"stdout\": \"\",",
      "      \"stderr\": \"failed\\n\",",
      "      \"exitCode\": 1,",
      "      \"timedOut\": false,",
      "      \"aborted\": false",
      "    }",
      "  ]",
      "}\n",
    ].join("\n"));
  });
});

describe("runHeadlessDiagnostics", () => {
  it("prints text diagnostics and returns non-zero when any command fails", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runHeadlessDiagnostics({
      baseDir: process.cwd(),
    }, { stdout, stderr }, {
      runDiagnostics: async () => [passResult, failResult],
    })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith(formatDiagnosticsText([passResult, failResult]));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints json diagnostics when requested", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runHeadlessDiagnostics({
      baseDir: process.cwd(),
      output: "json",
    }, { stdout, stderr }, {
      runDiagnostics: async () => [passResult],
    })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatDiagnosticsJson([passResult]));
    expect(stderr).not.toHaveBeenCalled();
  });
});

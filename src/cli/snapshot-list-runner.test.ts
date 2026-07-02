import { describe, expect, it, vi } from "vitest";
import type { CLIAppRuntime, CLIState } from "./runtime/types.js";
import type { SnapshotRecord } from "./runtime/snapshot-service.js";
import {
  formatSnapshotList,
  formatSnapshotListJson,
  runSnapshotList,
} from "./snapshot-list-runner.js";

const records: SnapshotRecord[] = [
  {
    turnId: "turn-1",
    absolutePath: "C:/repo/src/a.ts",
    displayPath: "src/a.ts",
    beforeExists: true,
    beforeContent: "old",
    afterExists: true,
    afterContent: "new",
    updatedAt: "2026-07-02T00:00:00.000Z",
  },
  {
    turnId: "turn-1",
    absolutePath: "C:/repo/generated.txt",
    displayPath: "generated.txt",
    beforeExists: false,
    afterExists: true,
    afterContent: "created",
    updatedAt: "2026-07-02T00:00:01.000Z",
  },
];

describe("formatSnapshotList", () => {
  it("formats snapshot records grouped by turn", () => {
    expect(formatSnapshotList(records)).toBe([
      "Snapshots (1 turn, 2 files)",
      "turn-1 2 files updated 2026-07-02T00:00:01.000Z",
      "  modified src/a.ts",
      "  created generated.txt",
      "",
    ].join("\n"));
  });

  it("formats empty snapshot journals", () => {
    expect(formatSnapshotList([])).toBe("No snapshots\n");
  });
});

describe("formatSnapshotListJson", () => {
  it("formats snapshot records as json", () => {
    expect(formatSnapshotListJson(records)).toContain("\"ok\": true");
    expect(formatSnapshotListJson(records)).toContain("\"records\"");
    expect(formatSnapshotListJson(records)).toContain("\"src/a.ts\"");
  });
});

describe("runSnapshotList", () => {
  it("runs the snapshots command, prints records, and destroys the runtime", async () => {
    let panel: CLIState["panel"] = { type: "none" };
    const runtime = {
      runCommand: vi.fn(async () => {
        panel = { type: "snapshots", records };
      }),
      getState: () => ({ panel }) as CLIState,
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSnapshotList(runtime, { stdout, stderr })).resolves.toBe(0);

    expect(runtime.runCommand).toHaveBeenCalledWith("snapshots", "");
    expect(stdout).toHaveBeenCalledWith(formatSnapshotList(records));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints snapshot records as json", async () => {
    let panel: CLIState["panel"] = { type: "none" };
    const runtime = {
      runCommand: vi.fn(async () => {
        panel = { type: "snapshots", records };
      }),
      getState: () => ({ panel }) as CLIState,
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSnapshotList(runtime, { stdout, stderr }, { output: "json" })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatSnapshotListJson(records));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints runtime errors as json when requested", async () => {
    const runtime = {
      runCommand: vi.fn(async () => {
        throw new Error("snapshots unavailable");
      }),
      getState: () => ({ panel: { type: "none" } }) as CLIState,
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSnapshotList(runtime, { stdout, stderr }, { output: "json" })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"snapshots unavailable\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });
});

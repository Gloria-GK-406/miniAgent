import { describe, expect, it, vi } from "vitest";
import type { CLIAppRuntime } from "./runtime/types.js";
import {
  formatSnapshotActionResult,
  formatSnapshotActionResultJson,
  runSnapshotAction,
} from "./snapshot-action-runner.js";

describe("formatSnapshotActionResult", () => {
  it("formats restored and reapplied snapshots", () => {
    expect(formatSnapshotActionResult({ ok: true, action: "restore", turnId: "turn-1" }))
      .toBe("Restored snapshot turn-1\n");
    expect(formatSnapshotActionResult({ ok: true, action: "reapply", turnId: "turn-1" }))
      .toBe("Reapplied snapshot turn-1\n");
  });
});

describe("formatSnapshotActionResultJson", () => {
  it("formats snapshot action results as json", () => {
    expect(formatSnapshotActionResultJson({ ok: true, action: "restore", turnId: "turn-1" }))
      .toBe("{\n  \"ok\": true,\n  \"action\": \"restore\",\n  \"turnId\": \"turn-1\"\n}\n");
  });
});

describe("runSnapshotAction", () => {
  it("restores a snapshot, prints text, and destroys the runtime", async () => {
    const runtime = {
      restoreSnapshot: vi.fn(async () => undefined),
      reapplySnapshot: vi.fn(async () => undefined),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSnapshotAction(runtime, { stdout, stderr }, {
      action: "restore",
      turnId: "turn-1",
    })).resolves.toBe(0);

    expect(runtime.restoreSnapshot).toHaveBeenCalledWith("turn-1");
    expect(runtime.reapplySnapshot).not.toHaveBeenCalled();
    expect(stdout).toHaveBeenCalledWith("Restored snapshot turn-1\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("reapplies a snapshot and prints json", async () => {
    const runtime = {
      restoreSnapshot: vi.fn(async () => undefined),
      reapplySnapshot: vi.fn(async () => undefined),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSnapshotAction(runtime, { stdout, stderr }, {
      action: "reapply",
      turnId: "turn-1",
      output: "json",
    })).resolves.toBe(0);

    expect(runtime.restoreSnapshot).not.toHaveBeenCalled();
    expect(runtime.reapplySnapshot).toHaveBeenCalledWith("turn-1");
    expect(stdout).toHaveBeenCalledWith(formatSnapshotActionResultJson({
      ok: true,
      action: "reapply",
      turnId: "turn-1",
    }));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints runtime errors as json when requested", async () => {
    const runtime = {
      restoreSnapshot: vi.fn(async () => {
        throw new Error("No snapshots found for turn turn-1");
      }),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSnapshotAction(runtime, { stdout, stderr }, {
      action: "restore",
      turnId: "turn-1",
      output: "json",
    })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"No snapshots found for turn turn-1\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });
});

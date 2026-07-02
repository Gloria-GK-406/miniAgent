import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createPermissionService } from "../runtime/permission-service.js";
import { createCLISessionService } from "../runtime/session-service.js";
import { createSnapshotService } from "../runtime/snapshot-service.js";
import { createCLIToolkit } from "./cli-toolkit.js";

describe("createCLIToolkit", () => {
  it("provides workspace-aware read and edit tools", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-tools-"));
    await writeFile(join(baseDir, "a.txt"), "hello", "utf-8");
    const toolkit = createCLIToolkit({
      baseDir,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: { execute: vi.fn() },
    });

    const names = toolkit.tools.map((tool) => tool.name);
    expect(names).toContain("read");
    expect(names).toContain("edit");

    const read = toolkit.tools.find((tool) => tool.name === "read")!;
    expect(await read.execute({ path: "a.txt" })).toBe("hello");
  });

  it("records snapshots for write and edit tools", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-tools-snapshots-"));
    await writeFile(join(baseDir, "a.txt"), "before", "utf-8");
    const sessionService = await createCLISessionService(baseDir);
    const session = await sessionService.ensureActiveSession();
    const snapshotService = createSnapshotService({
      baseDir,
      sessionService,
      getActiveSessionId: () => session.id,
      getActiveTurnId: () => "turn-1",
    });
    const toolkit = createCLIToolkit({
      baseDir,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: { execute: vi.fn() },
      snapshotService,
    });

    const write = toolkit.tools.find((tool) => tool.name === "write")!;
    const edit = toolkit.tools.find((tool) => tool.name === "edit")!;

    await write.execute({ path: "created.txt", content: "created" });
    await edit.execute({ path: "a.txt", oldString: "before", newString: "after" });

    expect(await snapshotService.listTurnSnapshots("turn-1")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayPath: "created.txt",
          beforeExists: false,
          afterExists: true,
          afterContent: "created",
        }),
        expect.objectContaining({
          displayPath: "a.txt",
          beforeExists: true,
          beforeContent: "before",
          afterExists: true,
          afterContent: "after",
        }),
      ]),
    );
  });

  it("applies multi_edit atomically", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-tools-multiedit-"));
    await writeFile(join(baseDir, "a.txt"), "one two three", "utf-8");
    const toolkit = createCLIToolkit({
      baseDir,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: { execute: vi.fn() },
    });
    const multiEdit = toolkit.tools.find((tool) => tool.name === "multi_edit")!;

    await multiEdit.execute({
      path: "a.txt",
      edits: [
        { oldString: "one", newString: "ONE" },
        { oldString: "three", newString: "THREE" },
      ],
    });

    await expect(readFile(join(baseDir, "a.txt"), "utf-8")).resolves.toBe("ONE two THREE");

    await expect(multiEdit.execute({
      path: "a.txt",
      edits: [
        { oldString: "ONE", newString: "one" },
        { oldString: "missing", newString: "value" },
      ],
    })).rejects.toThrow("oldString not found");
    await expect(readFile(join(baseDir, "a.txt"), "utf-8")).resolves.toBe("ONE two THREE");
  });

  it("applies a simple single-file unified patch", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-tools-patch-"));
    await writeFile(join(baseDir, "a.txt"), "alpha\nbeta\ngamma\n", "utf-8");
    const toolkit = createCLIToolkit({
      baseDir,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: { execute: vi.fn() },
    });
    const patch = toolkit.tools.find((tool) => tool.name === "patch")!;

    await patch.execute({
      patch: [
        "--- a/a.txt",
        "+++ b/a.txt",
        "@@ -1,3 +1,3 @@",
        " alpha",
        "-beta",
        "+BETA",
        " gamma",
      ].join("\n"),
    });

    await expect(readFile(join(baseDir, "a.txt"), "utf-8")).resolves.toBe("alpha\nBETA\ngamma\n");
  });
});

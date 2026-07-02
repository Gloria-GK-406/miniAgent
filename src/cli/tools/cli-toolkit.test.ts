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

  it("notifies after successful workspace mutations", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-tools-refresh-"));
    await writeFile(join(baseDir, "a.txt"), "before", "utf-8");
    const onWorkspaceFilesChanged = vi.fn(async () => {});
    const toolkit = createCLIToolkit({
      baseDir,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: { execute: vi.fn() },
      onWorkspaceFilesChanged,
    });

    const write = toolkit.tools.find((tool) => tool.name === "write")!;
    const edit = toolkit.tools.find((tool) => tool.name === "edit")!;

    await write.execute({ path: "created.txt", content: "created" });
    expect(onWorkspaceFilesChanged).toHaveBeenCalledTimes(1);

    await edit.execute({ path: "a.txt", oldString: "before", newString: "after" });
    expect(onWorkspaceFilesChanged).toHaveBeenCalledTimes(2);
  });

  it("does not notify when a workspace mutation fails", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-tools-refresh-failure-"));
    await writeFile(join(baseDir, "a.txt"), "before", "utf-8");
    const onWorkspaceFilesChanged = vi.fn(async () => {});
    const toolkit = createCLIToolkit({
      baseDir,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: { execute: vi.fn() },
      onWorkspaceFilesChanged,
    });

    const edit = toolkit.tools.find((tool) => tool.name === "edit")!;

    await expect(edit.execute({ path: "a.txt", oldString: "missing", newString: "after" }))
      .rejects.toThrow("oldString not found");
    expect(onWorkspaceFilesChanged).not.toHaveBeenCalled();
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

  it("deletes workspace files with snapshots and refresh notification", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-tools-delete-"));
    await writeFile(join(baseDir, "a.txt"), "remove me", "utf-8");
    const sessionService = await createCLISessionService(baseDir);
    const session = await sessionService.ensureActiveSession();
    const snapshotService = createSnapshotService({
      baseDir,
      sessionService,
      getActiveSessionId: () => session.id,
      getActiveTurnId: () => "turn-delete",
    });
    const onWorkspaceFilesChanged = vi.fn(async () => {});
    const toolkit = createCLIToolkit({
      baseDir,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: { execute: vi.fn() },
      snapshotService,
      onWorkspaceFilesChanged,
    });
    const deleteTool = toolkit.tools.find((tool) => tool.name === "delete")!;

    await expect(deleteTool.execute({ path: "a.txt" })).resolves.toBe("Deleted a.txt");

    await expect(readFile(join(baseDir, "a.txt"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(onWorkspaceFilesChanged).toHaveBeenCalledTimes(1);
    expect(await snapshotService.listTurnSnapshots("turn-delete")).toEqual([
      expect.objectContaining({
        displayPath: "a.txt",
        beforeExists: true,
        beforeContent: "remove me",
        afterExists: false,
      }),
    ]);
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

  it("creates files from unified patches with snapshots and refresh notification", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-tools-patch-create-"));
    const sessionService = await createCLISessionService(baseDir);
    const session = await sessionService.ensureActiveSession();
    const snapshotService = createSnapshotService({
      baseDir,
      sessionService,
      getActiveSessionId: () => session.id,
      getActiveTurnId: () => "turn-patch-create",
    });
    const onWorkspaceFilesChanged = vi.fn(async () => {});
    const toolkit = createCLIToolkit({
      baseDir,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: { execute: vi.fn() },
      snapshotService,
      onWorkspaceFilesChanged,
    });
    const patch = toolkit.tools.find((tool) => tool.name === "patch")!;

    await expect(patch.execute({
      patch: [
        "--- /dev/null",
        "+++ b/new.txt",
        "@@ -0,0 +1,2 @@",
        "+alpha",
        "+beta",
      ].join("\n"),
    })).resolves.toBe("Created new.txt");

    await expect(readFile(join(baseDir, "new.txt"), "utf-8")).resolves.toBe("alpha\nbeta");
    expect(onWorkspaceFilesChanged).toHaveBeenCalledTimes(1);
    expect(await snapshotService.listTurnSnapshots("turn-patch-create")).toEqual([
      expect.objectContaining({
        displayPath: "new.txt",
        beforeExists: false,
        afterExists: true,
        afterContent: "alpha\nbeta",
      }),
    ]);
  });

  it("refuses to create an existing file from a unified patch", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-tools-patch-create-existing-"));
    await writeFile(join(baseDir, "new.txt"), "existing", "utf-8");
    const onWorkspaceFilesChanged = vi.fn(async () => {});
    const toolkit = createCLIToolkit({
      baseDir,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: { execute: vi.fn() },
      onWorkspaceFilesChanged,
    });
    const patch = toolkit.tools.find((tool) => tool.name === "patch")!;

    await expect(patch.execute({
      patch: [
        "--- /dev/null",
        "+++ b/new.txt",
        "@@ -0,0 +1,1 @@",
        "+replacement",
      ].join("\n"),
    })).rejects.toThrow("Patch target already exists: new.txt");

    await expect(readFile(join(baseDir, "new.txt"), "utf-8")).resolves.toBe("existing");
    expect(onWorkspaceFilesChanged).not.toHaveBeenCalled();
  });

  it("deletes files from unified patches with snapshots and refresh notification", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-tools-patch-delete-"));
    await writeFile(join(baseDir, "old.txt"), "alpha\nbeta", "utf-8");
    const sessionService = await createCLISessionService(baseDir);
    const session = await sessionService.ensureActiveSession();
    const snapshotService = createSnapshotService({
      baseDir,
      sessionService,
      getActiveSessionId: () => session.id,
      getActiveTurnId: () => "turn-patch-delete",
    });
    const onWorkspaceFilesChanged = vi.fn(async () => {});
    const toolkit = createCLIToolkit({
      baseDir,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: { execute: vi.fn() },
      snapshotService,
      onWorkspaceFilesChanged,
    });
    const patch = toolkit.tools.find((tool) => tool.name === "patch")!;

    await expect(patch.execute({
      patch: [
        "--- a/old.txt",
        "+++ /dev/null",
        "@@ -1,2 +0,0 @@",
        "-alpha",
        "-beta",
      ].join("\n"),
    })).resolves.toBe("Deleted old.txt");

    await expect(readFile(join(baseDir, "old.txt"), "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(onWorkspaceFilesChanged).toHaveBeenCalledTimes(1);
    expect(await snapshotService.listTurnSnapshots("turn-patch-delete")).toEqual([
      expect.objectContaining({
        displayPath: "old.txt",
        beforeExists: true,
        beforeContent: "alpha\nbeta",
        afterExists: false,
      }),
    ]);
  });
});

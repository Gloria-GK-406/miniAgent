import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCLISessionService } from "./session-service.js";
import { createSnapshotService } from "./snapshot-service.js";

async function setupSnapshotService(): Promise<{
  baseDir: string;
  sessionId: string;
  setTurnId: (id: string | null) => void;
  service: ReturnType<typeof createSnapshotService>;
}> {
  const baseDir = await mkdtemp(join(tmpdir(), "miniagent-snapshots-"));
  const sessionService = await createCLISessionService(baseDir);
  const session = await sessionService.ensureActiveSession();
  let turnId: string | null = "turn-1";
  const service = createSnapshotService({
    baseDir,
    sessionService,
    getActiveSessionId: () => session.id,
    getActiveTurnId: () => turnId,
  });
  return {
    baseDir,
    sessionId: session.id,
    setTurnId: (id) => {
      turnId = id;
    },
    service,
  };
}

describe("SnapshotService", () => {
  it("records one snapshot per file and turn while keeping the first before content", async () => {
    const { baseDir, service } = await setupSnapshotService();
    await writeFile(join(baseDir, "a.txt"), "one", "utf-8");

    await service.recordBeforeMutation("a.txt", async () => {
      await writeFile(join(baseDir, "a.txt"), "two", "utf-8");
    });
    await service.recordBeforeMutation("a.txt", async () => {
      await writeFile(join(baseDir, "a.txt"), "three", "utf-8");
    });

    expect(await service.listTurnSnapshots("turn-1")).toMatchObject([
      {
        turnId: "turn-1",
        displayPath: "a.txt",
        beforeExists: true,
        beforeContent: "one",
        afterExists: true,
        afterContent: "three",
      },
    ]);
  });

  it("lists all snapshot records for the active session", async () => {
    const { baseDir, service, setTurnId } = await setupSnapshotService();
    await writeFile(join(baseDir, "a.txt"), "one", "utf-8");

    await service.recordBeforeMutation("a.txt", async () => {
      await writeFile(join(baseDir, "a.txt"), "two", "utf-8");
    });
    setTurnId("turn-2");
    await service.recordBeforeMutation("created.txt", async () => {
      await writeFile(join(baseDir, "created.txt"), "created", "utf-8");
    });

    expect(await service.listSnapshots()).toMatchObject([
      {
        turnId: "turn-1",
        displayPath: "a.txt",
        beforeExists: true,
        afterExists: true,
      },
      {
        turnId: "turn-2",
        displayPath: "created.txt",
        beforeExists: false,
        afterExists: true,
      },
    ]);
  });

  it("restores changed and newly created files", async () => {
    const { baseDir, service } = await setupSnapshotService();
    await writeFile(join(baseDir, "existing.txt"), "before", "utf-8");

    await service.recordBeforeMutation("existing.txt", async () => {
      await writeFile(join(baseDir, "existing.txt"), "after", "utf-8");
    });
    await service.recordBeforeMutation("created.txt", async () => {
      await writeFile(join(baseDir, "created.txt"), "created", "utf-8");
    });

    await service.restoreTurn("turn-1");

    await expect(readFile(join(baseDir, "existing.txt"), "utf-8")).resolves.toBe("before");
    await expect(readFile(join(baseDir, "created.txt"), "utf-8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses to restore files changed after the recorded mutation", async () => {
    const { baseDir, service } = await setupSnapshotService();
    await writeFile(join(baseDir, "a.txt"), "one", "utf-8");
    await service.recordBeforeMutation("a.txt", async () => {
      await writeFile(join(baseDir, "a.txt"), "two", "utf-8");
    });
    await writeFile(join(baseDir, "a.txt"), "external", "utf-8");

    await expect(service.restoreTurn("turn-1")).rejects.toThrow("Snapshot conflict for a.txt");
    await expect(readFile(join(baseDir, "a.txt"), "utf-8")).resolves.toBe("external");
  });

  it("skips journaling when no active turn exists", async () => {
    const { baseDir, service, setTurnId } = await setupSnapshotService();
    await mkdir(join(baseDir, "nested"), { recursive: true });
    setTurnId(null);

    await service.recordBeforeMutation("nested/a.txt", async () => {
      await writeFile(join(baseDir, "nested", "a.txt"), "content", "utf-8");
    });

    expect(await service.listTurnSnapshots("turn-1")).toEqual([]);
  });
});

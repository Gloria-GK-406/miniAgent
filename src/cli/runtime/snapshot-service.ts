import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { createFunctionSchema, createProtocolSchema } from "../../core/index.js";
import { CLIAGENT_DIR } from "../config.js";
import { resolveWorkspacePath } from "../tools/workspace.js";
import { CLISessionServiceSchema } from "./session-service.js";

export const SnapshotRecordSchema = z.object({
  turnId: z.string(),
  absolutePath: z.string(),
  displayPath: z.string(),
  beforeExists: z.boolean(),
  beforeContent: z.string().optional(),
  afterExists: z.boolean(),
  afterContent: z.string().optional(),
  updatedAt: z.string(),
});

export type SnapshotRecord = z.infer<typeof SnapshotRecordSchema>;

const SnapshotJournalSchema = z.object({
  version: z.literal(1),
  records: z.array(SnapshotRecordSchema),
});

interface FileState {
  exists: boolean;
  content?: string;
}

export const SnapshotServiceOptionsSchema = z.object({
  baseDir: z.string(),
  sessionService: CLISessionServiceSchema,
  getActiveSessionId: createFunctionSchema<() => string>(),
  getActiveTurnId: createFunctionSchema<() => string | null>(),
});
export type SnapshotServiceOptions = z.infer<typeof SnapshotServiceOptionsSchema>;

export const SnapshotServiceSchema = createProtocolSchema({
  recordBeforeMutation: createFunctionSchema<(
    path: string,
    mutate: () => Promise<void>,
  ) => Promise<void>>(),
  restoreTurn: createFunctionSchema<(turnId: string) => Promise<void>>(),
  reapplyTurn: createFunctionSchema<(turnId: string) => Promise<void>>(),
  captureRedo: createFunctionSchema<(
    turnId: string,
  ) => Promise<SnapshotRecord[]>>(),
  listSnapshots: createFunctionSchema<() => Promise<SnapshotRecord[]>>(),
  listTurnSnapshots: createFunctionSchema<(
    turnId: string,
  ) => Promise<SnapshotRecord[]>>(),
});
export type SnapshotService = z.infer<typeof SnapshotServiceSchema>;

async function readFileState(path: string): Promise<FileState> {
  try {
    return {
      exists: true,
      content: await readFile(path, "utf-8"),
    };
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { exists: false };
    }
    throw error;
  }
}

async function writeFileState(path: string, state: FileState): Promise<void> {
  if (!state.exists) {
    await rm(path, { force: true });
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, state.content ?? "", "utf-8");
}

function statesEqual(left: FileState, right: FileState): boolean {
  return left.exists === right.exists && (left.content ?? "") === (right.content ?? "");
}

function beforeState(record: SnapshotRecord): FileState {
  return {
    exists: record.beforeExists,
    ...(record.beforeContent !== undefined && { content: record.beforeContent }),
  };
}

function afterState(record: SnapshotRecord): FileState {
  return {
    exists: record.afterExists,
    ...(record.afterContent !== undefined && { content: record.afterContent }),
  };
}

function journalPath(baseDir: string, sessionId: string): string {
  return join(baseDir, CLIAGENT_DIR, "sessions", sessionId, "journal", "snapshots.json");
}

export function createSnapshotService(options: SnapshotServiceOptions): SnapshotService {
  async function readJournal(): Promise<SnapshotRecord[]> {
    try {
      const parsed = SnapshotJournalSchema.parse(
        JSON.parse(await readFile(journalPath(options.baseDir, options.getActiveSessionId()), "utf-8")) as unknown,
      );
      return parsed.records;
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async function writeJournal(records: SnapshotRecord[]): Promise<void> {
    const path = journalPath(options.baseDir, options.getActiveSessionId());
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify({ version: 1, records }, null, 2)}\n`, "utf-8");
  }

  async function listTurnSnapshots(turnId: string): Promise<SnapshotRecord[]> {
    return (await readJournal()).filter((record) => record.turnId === turnId);
  }

  async function applyRecords(
    turnId: string,
    expected: (record: SnapshotRecord) => FileState,
    target: (record: SnapshotRecord) => FileState,
  ): Promise<void> {
    const records = await listTurnSnapshots(turnId);
    for (const record of records) {
      const current = await readFileState(record.absolutePath);
      if (!statesEqual(current, expected(record))) {
        throw new Error(`Snapshot conflict for ${record.displayPath}`);
      }
    }

    for (const record of [...records].reverse()) {
      await writeFileState(record.absolutePath, target(record));
    }
  }

  return {
    recordBeforeMutation: async (path, mutate) => {
      const turnId = options.getActiveTurnId();
      if (turnId === null) {
        await mutate();
        return;
      }

      const target = resolveWorkspacePath(options.baseDir, path);
      const before = await readFileState(target.absolutePath);
      await mutate();
      const after = await readFileState(target.absolutePath);
      const records = await readJournal();
      const existing = records.find((record) =>
        record.turnId === turnId && record.absolutePath === target.absolutePath);
      const next: SnapshotRecord = SnapshotRecordSchema.parse({
        turnId,
        absolutePath: target.absolutePath,
        displayPath: target.displayPath,
        beforeExists: existing?.beforeExists ?? before.exists,
        beforeContent: existing?.beforeContent ?? before.content,
        afterExists: after.exists,
        afterContent: after.content,
        updatedAt: new Date().toISOString(),
      });

      if (existing === undefined) {
        records.push(next);
      } else {
        Object.assign(existing, next);
      }
      await writeJournal(records);
    },
    restoreTurn: async (turnId) => {
      await applyRecords(turnId, afterState, beforeState);
    },
    reapplyTurn: async (turnId) => {
      await applyRecords(turnId, beforeState, afterState);
    },
    captureRedo: async (turnId) => listTurnSnapshots(turnId),
    listSnapshots: readJournal,
    listTurnSnapshots,
  };
}

import { z } from "zod";
import type { SnapshotRecord } from "./runtime/snapshot-service.js";
import type { CLIAppRuntime } from "./runtime/types.js";
import type { PrintStreams } from "./print-runner.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";

export const SnapshotListOutputSchema = z.enum(["text", "json"]);
export type SnapshotListOutput = z.infer<typeof SnapshotListOutputSchema>;

interface SnapshotGroup {
  turnId: string;
  updatedAt: string;
  records: SnapshotRecord[];
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function snapshotChangeLabel(record: SnapshotRecord): "created" | "deleted" | "modified" | "unchanged" {
  if (!record.beforeExists && record.afterExists) return "created";
  if (record.beforeExists && !record.afterExists) return "deleted";
  if (record.beforeExists && record.afterExists) return "modified";
  return "unchanged";
}

function groupSnapshotRecords(records: SnapshotRecord[]): SnapshotGroup[] {
  const groups = new Map<string, SnapshotGroup>();
  for (const record of records) {
    const existing = groups.get(record.turnId);
    if (existing === undefined) {
      groups.set(record.turnId, {
        turnId: record.turnId,
        updatedAt: record.updatedAt,
        records: [record],
      });
      continue;
    }
    existing.records.push(record);
    if (record.updatedAt > existing.updatedAt) {
      existing.updatedAt = record.updatedAt;
    }
  }
  return [...groups.values()];
}

export function formatSnapshotList(records: SnapshotRecord[]): string {
  if (records.length === 0) {
    return "No snapshots\n";
  }
  const groups = groupSnapshotRecords(records);
  return `${[
    `Snapshots (${plural(groups.length, "turn")}, ${plural(records.length, "file")})`,
    ...groups.flatMap((group) => [
      `${group.turnId} ${plural(group.records.length, "file")} updated ${group.updatedAt}`,
      ...group.records.map((record) => `  ${snapshotChangeLabel(record)} ${record.displayPath}`),
    ]),
  ].join("\n")}\n`;
}

export function formatSnapshotListJson(records: SnapshotRecord[]): string {
  return `${JSON.stringify({ ok: true, records }, null, 2)}\n`;
}

export async function runSnapshotList(
  runtime: CLIAppRuntime,
  streams: PrintStreams,
  options: { output?: SnapshotListOutput } = {},
): Promise<number> {
  const output = options.output ?? "text";
  try {
    await runtime.runCommand("snapshots", "");
    const panel = runtime.getState().panel;
    if (panel.type !== "snapshots") {
      writeHeadlessError(streams, "Snapshots did not produce results", output);
      return 1;
    }
    streams.stdout(
      output === "json"
        ? formatSnapshotListJson(panel.records)
        : formatSnapshotList(panel.records),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  } finally {
    await runtime.destroy();
  }
}

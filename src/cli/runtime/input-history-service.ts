import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { CLIAGENT_DIR } from "../config.js";

const DEFAULT_INPUT_HISTORY_LIMIT = 100;

const InputHistoryFileSchema = z.object({
  version: z.literal(1),
  entries: z.array(z.string()),
});

export interface InputHistoryServiceOptions {
  limit?: number;
}

export interface InputHistoryService {
  list(): Promise<string[]>;
  append(input: string): Promise<string[]>;
}

function historyPath(baseDir: string): string {
  return join(baseDir, CLIAGENT_DIR, "input-history.json");
}

function appendEntry(history: string[], input: string, limit: number): string[] {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return history;
  }
  const next = history.at(-1) === trimmed ? history : [...history, trimmed];
  return next.slice(-limit);
}

export function createInputHistoryService(
  baseDir: string,
  options: InputHistoryServiceOptions = {},
): InputHistoryService {
  const limit = options.limit ?? DEFAULT_INPUT_HISTORY_LIMIT;
  const path = historyPath(baseDir);

  async function readEntries(): Promise<string[]> {
    try {
      const parsed = InputHistoryFileSchema.parse(
        JSON.parse(await readFile(path, "utf-8")) as unknown,
      );
      return parsed.entries.slice(-limit);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async function writeEntries(entries: string[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, "utf-8");
  }

  return {
    list: readEntries,
    append: async (input) => {
      const entries = appendEntry(await readEntries(), input, limit);
      await writeEntries(entries);
      return entries;
    },
  };
}

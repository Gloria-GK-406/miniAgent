import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInputHistoryService } from "./input-history-service.js";

describe("InputHistoryService", () => {
  it("returns an empty list when no history file exists", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-input-history-empty-"));
    const service = createInputHistoryService(baseDir);

    await expect(service.list()).resolves.toEqual([]);
  });

  it("persists trimmed history entries without consecutive duplicates", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-input-history-"));
    const service = createInputHistoryService(baseDir);

    await service.append("  first  ");
    await service.append("first");
    await service.append("second");

    await expect(service.list()).resolves.toEqual(["first", "second"]);
    await expect(readFile(join(baseDir, ".cliagent", "input-history.json"), "utf-8"))
      .resolves.toContain('"second"');
  });

  it("keeps newest entries within the configured limit", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-input-history-limit-"));
    const service = createInputHistoryService(baseDir, { limit: 2 });

    await service.append("one");
    await service.append("two");
    await service.append("three");

    await expect(service.list()).resolves.toEqual(["two", "three"]);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readTool } from "./read.js";

describe("readTool", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "read-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("reads entire file content", async () => {
    const filePath = join(testDir, "hello.txt");
    await writeFile(filePath, "line1\nline2\nline3", "utf-8");

    const result = await readTool.execute({ path: filePath });
    expect(result).toBe("line1\nline2\nline3");
  });

  it("reads directory entries", async () => {
    await writeFile(join(testDir, "a.txt"), "", "utf-8");
    await writeFile(join(testDir, "b.txt"), "", "utf-8");

    const result = await readTool.execute({ path: testDir });
    const entries = result.split("\n");
    expect(entries).toContain("a.txt");
    expect(entries).toContain("b.txt");
  });

  it("returns error for non-existent path", async () => {
    const result = await readTool.execute({ path: join(testDir, "nope.txt") });
    expect(result).toBe(`Error: path not found: ${join(testDir, "nope.txt")}`);
  });

  it("reads file with offset only", async () => {
    const filePath = join(testDir, "lines.txt");
    await writeFile(filePath, "line1\nline2\nline3\nline4\nline5", "utf-8");

    const result = await readTool.execute({ path: filePath, offset: 3 });
    expect(result).toBe("line3\nline4\nline5");
  });

  it("reads file with limit only", async () => {
    const filePath = join(testDir, "lines.txt");
    await writeFile(filePath, "line1\nline2\nline3\nline4\nline5", "utf-8");

    const result = await readTool.execute({ path: filePath, limit: 2 });
    expect(result).toBe("line1\nline2");
  });

  it("reads file with offset and limit", async () => {
    const filePath = join(testDir, "lines.txt");
    await writeFile(filePath, "line1\nline2\nline3\nline4\nline5", "utf-8");

    const result = await readTool.execute({ path: filePath, offset: 2, limit: 2 });
    expect(result).toBe("line2\nline3");
  });

  it("reads empty file", async () => {
    const filePath = join(testDir, "empty.txt");
    await writeFile(filePath, "", "utf-8");

    const result = await readTool.execute({ path: filePath });
    expect(result).toBe("");
  });

  it("reads empty directory", async () => {
    const emptyDir = join(testDir, "empty");
    await mkdir(emptyDir);

    const result = await readTool.execute({ path: emptyDir });
    expect(result).toBe("");
  });

  it("has correct tool metadata", () => {
    expect(readTool.name).toBe("read");
    expect(readTool.description).toBeTruthy();
  });
});

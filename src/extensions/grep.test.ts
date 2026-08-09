import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { grepTool } from "./grep.js";

describe("grepTool", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "grep-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("finds matching lines in a directory", async () => {
    await writeFile(join(testDir, "a.txt"), "hello world\nfoo bar", "utf-8");
    await writeFile(join(testDir, "b.txt"), "no match here", "utf-8");

    const result = await grepTool.execute({ pattern: "hello", path: testDir });
    expect(result).toContain("hello world");
    expect(result).not.toContain("no match");
  });

  it("finds matches in a single file", async () => {
    const filePath = join(testDir, "single.txt");
    await writeFile(filePath, "line1\nline2\nline3", "utf-8");

    const result = await grepTool.execute({ pattern: "line2", path: filePath });
    expect(result).toContain("line2");
  });

  it("includes line numbers in output", async () => {
    const filePath = join(testDir, "lined.txt");
    await writeFile(filePath, "aaa\nbbb\naaa", "utf-8");

    const result = await grepTool.execute({ pattern: "aaa", path: filePath });
    expect(result).toContain(":1:");
    expect(result).toContain(":3:");
  });

  it("supports regex patterns", async () => {
    const filePath = join(testDir, "regex.txt");
    await writeFile(filePath, "foo123\nbar456\nbaz", "utf-8");

    const result = await grepTool.execute({ pattern: "\\d+", path: filePath });
    expect(result).toContain("foo123");
    expect(result).toContain("bar456");
    expect(result).not.toContain("baz");
  });

  it("filters by include glob", async () => {
    await writeFile(join(testDir, "a.ts"), "TODO: fix this", "utf-8");
    await writeFile(join(testDir, "b.js"), "TODO: fix that", "utf-8");

    const result = await grepTool.execute({
      pattern: "TODO",
      path: testDir,
      include: "*.ts",
    });
    expect(result).toContain("a.ts");
    expect(result).not.toContain("b.js");
  });

  it("returns message when no matches found", async () => {
    const filePath = join(testDir, "nomatch.txt");
    await writeFile(filePath, "nothing here", "utf-8");

    const result = await grepTool.execute({ pattern: "missing", path: filePath });
    expect(result).toBe("No matches found.");
  });

  it("returns error for non-existent path", async () => {
    const result = await grepTool.execute({
      pattern: "test",
      path: join(testDir, "nope"),
    });
    expect(result).toMatch(/^Error: path not found/);
  });

  it("searches nested directories", async () => {
    await mkdir(join(testDir, "sub"), { recursive: true });
    await writeFile(join(testDir, "sub", "deep.txt"), "findme", "utf-8");

    const result = await grepTool.execute({ pattern: "findme", path: testDir });
    expect(result).toContain("findme");
    expect(result).toContain("deep.txt");
  });

  it("finds multiple matches in same file", async () => {
    const filePath = join(testDir, "multi.txt");
    await writeFile(filePath, "cat\ndog\ncat mouse", "utf-8");

    const result = await grepTool.execute({ pattern: "cat", path: filePath });
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
  });

  it("has correct tool metadata", () => {
    expect(grepTool.name).toBe("grep");
    expect(grepTool.description).toBeTruthy();
  });
});

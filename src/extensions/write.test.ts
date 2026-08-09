import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeTool } from "./write.js";

describe("writeTool", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "write-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("writes content to a new file", async () => {
    const filePath = join(testDir, "output.txt");

    const result = await writeTool.execute({ path: filePath, content: "hello world" });
    expect(result).toBe(`Successfully wrote to ${filePath}`);

    const written = await readFile(filePath, "utf-8");
    expect(written).toBe("hello world");
  });

  it("overwrites existing file", async () => {
    const filePath = join(testDir, "output.txt");
    await writeTool.execute({ path: filePath, content: "old" });
    await writeTool.execute({ path: filePath, content: "new" });

    const written = await readFile(filePath, "utf-8");
    expect(written).toBe("new");
  });

  it("creates parent directories automatically", async () => {
    const filePath = join(testDir, "deep", "nested", "dir", "file.txt");

    await writeTool.execute({ path: filePath, content: "deep" });

    const written = await readFile(filePath, "utf-8");
    expect(written).toBe("deep");
  });

  it("writes empty content", async () => {
    const filePath = join(testDir, "empty.txt");

    await writeTool.execute({ path: filePath, content: "" });

    const written = await readFile(filePath, "utf-8");
    expect(written).toBe("");
    const s = await stat(filePath);
    expect(s.size).toBe(0);
  });

  it("writes unicode content", async () => {
    const filePath = join(testDir, "unicode.txt");
    const content = "你好世界 🌍 émojis";

    await writeTool.execute({ path: filePath, content });

    const written = await readFile(filePath, "utf-8");
    expect(written).toBe(content);
  });

  it("writes multiline content", async () => {
    const filePath = join(testDir, "multi.txt");
    const content = "line1\nline2\nline3";

    await writeTool.execute({ path: filePath, content });

    const written = await readFile(filePath, "utf-8");
    expect(written).toBe(content);
  });

  it("has correct tool metadata", () => {
    expect(writeTool.name).toBe("write");
    expect(writeTool.description).toBeTruthy();
  });
});

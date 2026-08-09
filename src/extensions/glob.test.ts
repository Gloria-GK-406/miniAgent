import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { globTool } from "./glob.js";

describe("globTool", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "glob-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("finds all .ts files with **/*.ts", async () => {
    await writeFile(join(testDir, "a.ts"), "", "utf-8");
    await writeFile(join(testDir, "b.js"), "", "utf-8");
    await writeFile(join(testDir, "c.ts"), "", "utf-8");

    const result = await globTool.execute({ pattern: "**/*.ts", path: testDir });
    const lines = result.split("\n").sort();
    expect(lines).toEqual(["a.ts", "c.ts"]);
  });

  it("finds files in nested directories with **", async () => {
    await mkdir(join(testDir, "src", "core"), { recursive: true });
    await writeFile(join(testDir, "src", "index.ts"), "", "utf-8");
    await writeFile(join(testDir, "src", "core", "agent.ts"), "", "utf-8");

    const result = await globTool.execute({ pattern: "**/*.ts", path: testDir });
    const lines = result.split("\n").sort();
    expect(lines).toEqual([
      "src/agent.ts".split("/").pop() ? "src/core/agent.ts" : "",
      "src/index.ts",
    ].filter(Boolean).sort());
  });

  it("returns message when no files match", async () => {
    await writeFile(join(testDir, "a.txt"), "", "utf-8");

    const result = await globTool.execute({ pattern: "**/*.ts", path: testDir });
    expect(result).toBe("No files matched the pattern.");
  });

  it("matches single * wildcard in filename", async () => {
    await writeFile(join(testDir, "foo.ts"), "", "utf-8");
    await writeFile(join(testDir, "bar.ts"), "", "utf-8");
    await writeFile(join(testDir, "baz.js"), "", "utf-8");

    const result = await globTool.execute({ pattern: "*.ts", path: testDir });
    const lines = result.split("\n").sort();
    expect(lines).toEqual(["bar.ts", "foo.ts"]);
  });

  it("matches with ? wildcard for single character", async () => {
    await writeFile(join(testDir, "a1.ts"), "", "utf-8");
    await writeFile(join(testDir, "a2.ts"), "", "utf-8");
    await writeFile(join(testDir, "ab.ts"), "", "utf-8");

    const result = await globTool.execute({ pattern: "a?.ts", path: testDir });
    const lines = result.split("\n").sort();
    expect(lines).toEqual(["a1.ts", "a2.ts", "ab.ts"]);
  });

  it("matches specific nested path", async () => {
    await mkdir(join(testDir, "src"), { recursive: true });
    await mkdir(join(testDir, "test"), { recursive: true });
    await writeFile(join(testDir, "src", "main.ts"), "", "utf-8");
    await writeFile(join(testDir, "test", "main.ts"), "", "utf-8");

    const result = await globTool.execute({ pattern: "src/*.ts", path: testDir });
    expect(result).toBe("src/main.ts");
  });

  it("finds all files with **/*", async () => {
    await writeFile(join(testDir, "a.txt"), "", "utf-8");
    await mkdir(join(testDir, "sub"));
    await writeFile(join(testDir, "sub", "b.txt"), "", "utf-8");

    const result = await globTool.execute({ pattern: "**/*", path: testDir });
    const lines = result.split("\n").sort();
    expect(lines).toEqual(["a.txt", "sub/b.txt"]);
  });

  it("has correct tool metadata", () => {
    expect(globTool.name).toBe("glob");
    expect(globTool.description).toBeTruthy();
  });
});

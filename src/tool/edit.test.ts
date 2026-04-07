import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { editTool } from "./edit.js";

describe("editTool", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "edit-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("replaces a unique string", async () => {
    const filePath = join(testDir, "file.txt");
    await writeFile(filePath, "hello world", "utf-8");

    const result = await editTool.execute({
      path: filePath,
      oldString: "world",
      newString: "miniagent",
    });
    expect(result).toBe(`Successfully edited ${filePath}`);

    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("hello miniagent");
  });

  it("returns error when oldString not found", async () => {
    const filePath = join(testDir, "file.txt");
    await writeFile(filePath, "hello", "utf-8");

    const result = await editTool.execute({
      path: filePath,
      oldString: "missing",
      newString: "replacement",
    });
    expect(result).toBe(`Error: oldString not found in ${filePath}`);
  });

  it("returns error when oldString found multiple times", async () => {
    const filePath = join(testDir, "file.txt");
    await writeFile(filePath, "aaa bbb aaa", "utf-8");

    const result = await editTool.execute({
      path: filePath,
      oldString: "aaa",
      newString: "ccc",
    });
    expect(result).toBe(`Error: oldString found 2 times in ${filePath}. Use replaceAll: true or provide more context to make it unique.`);
  });

  it("replaces all occurrences with replaceAll", async () => {
    const filePath = join(testDir, "file.txt");
    await writeFile(filePath, "aaa bbb aaa ccc aaa", "utf-8");

    const result = await editTool.execute({
      path: filePath,
      oldString: "aaa",
      newString: "zzz",
      replaceAll: true,
    });
    expect(result).toBe(`Successfully edited ${filePath}`);

    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("zzz bbb zzz ccc zzz");
  });

  it("returns error for non-existent file", async () => {
    const result = await editTool.execute({
      path: join(testDir, "nope.txt"),
      oldString: "x",
      newString: "y",
    });
    expect(result).toMatch(/^Error: file not found/);
  });

  it("replaces multiline string", async () => {
    const filePath = join(testDir, "file.txt");
    await writeFile(filePath, "line1\nline2\nline3", "utf-8");

    await editTool.execute({
      path: filePath,
      oldString: "line1\nline2",
      newString: "replaced",
    });

    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("replaced\nline3");
  });

  it("replaces with empty string (deletion)", async () => {
    const filePath = join(testDir, "file.txt");
    await writeFile(filePath, "before target after", "utf-8");

    await editTool.execute({
      path: filePath,
      oldString: "target ",
      newString: "",
    });

    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("before after");
  });

  it("preserves file content when replacement is same", async () => {
    const filePath = join(testDir, "file.txt");
    await writeFile(filePath, "abc", "utf-8");

    await editTool.execute({
      path: filePath,
      oldString: "abc",
      newString: "abc",
    });

    const content = await readFile(filePath, "utf-8");
    expect(content).toBe("abc");
  });

  it("has correct tool metadata", () => {
    expect(editTool.name).toBe("edit");
    expect(editTool.description).toBeTruthy();
  });
});

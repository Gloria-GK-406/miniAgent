import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReferenceService, extractReferenceTokens } from "./reference-service.js";

describe("extractReferenceTokens", () => {
  it("extracts file references with optional ranges", () => {
    expect(extractReferenceTokens("Explain @src/a.ts and @README.md:2-4")).toEqual([
      "@src/a.ts",
      "@README.md:2-4",
    ]);
  });
});

describe("ReferenceService", () => {
  it("resolves a referenced file range", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-ref-"));
    await mkdir(join(baseDir, "src"), { recursive: true });
    await writeFile(join(baseDir, "src", "a.ts"), "one\ntwo\nthree\n", "utf-8");
    const service = createReferenceService(baseDir);

    const refs = await service.resolveReferences("Read @src/a.ts:2-3");

    expect(refs).toEqual([{
      token: "@src/a.ts:2-3",
      path: join(baseDir, "src", "a.ts"),
      displayPath: "src/a.ts",
      content: "two\nthree",
      startLine: 2,
      endLine: 3,
    }]);
  });

  it("rejects references outside the workspace", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-ref-"));
    const service = createReferenceService(baseDir);

    await expect(service.resolveReferences("Read @../outside.txt"))
      .rejects
      .toThrow("Reference escapes workspace");
  });
});

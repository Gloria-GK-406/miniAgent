import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatReferenceList,
  formatReferenceListJson,
  runReferenceList,
} from "./reference-list-runner.js";

describe("formatReferenceList", () => {
  it("formats reference candidates for terminal output", () => {
    expect(formatReferenceList(["README.md", "src/index.ts"])).toBe([
      "Reference candidates (2 files)",
      "README.md",
      "src/index.ts",
      "",
    ].join("\n"));
  });

  it("formats empty reference candidates", () => {
    expect(formatReferenceList([])).toBe("No reference candidates\n");
  });
});

describe("formatReferenceListJson", () => {
  it("formats reference candidates as json", () => {
    expect(formatReferenceListJson(["README.md"])).toBe([
      "{",
      "  \"ok\": true,",
      "  \"references\": [",
      "    \"README.md\"",
      "  ]",
      "}\n",
    ].join("\n"));
  });
});

describe("runReferenceList", () => {
  it("prints workspace reference candidates", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-reference-list-"));
    await mkdir(join(baseDir, "src"), { recursive: true });
    await mkdir(join(baseDir, "node_modules"), { recursive: true });
    await writeFile(join(baseDir, "README.md"), "# Project", "utf-8");
    await writeFile(join(baseDir, "src", "index.ts"), "export {};\n", "utf-8");
    await writeFile(join(baseDir, "node_modules", "ignored.js"), "", "utf-8");
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runReferenceList({ baseDir }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatReferenceList([
      "README.md",
      "src/index.ts",
    ]));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints workspace reference candidates as json", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-reference-list-"));
    await writeFile(join(baseDir, "README.md"), "# Project", "utf-8");
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runReferenceList({
      baseDir,
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatReferenceListJson(["README.md"]));
    expect(stderr).not.toHaveBeenCalled();
  });
});

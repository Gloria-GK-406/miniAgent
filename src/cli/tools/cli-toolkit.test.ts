import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createPermissionService } from "../runtime/permission-service.js";
import { createCLIToolkit } from "./cli-toolkit.js";

describe("createCLIToolkit", () => {
  it("provides workspace-aware read and edit tools", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-tools-"));
    await writeFile(join(baseDir, "a.txt"), "hello", "utf-8");
    const toolkit = createCLIToolkit({
      baseDir,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: { execute: vi.fn() },
    });

    const names = toolkit.tools.map((tool) => tool.name);
    expect(names).toContain("read");
    expect(names).toContain("edit");

    const read = toolkit.tools.find((tool) => tool.name === "read")!;
    expect(await read.execute({ path: "a.txt" })).toBe("hello");
  });
});

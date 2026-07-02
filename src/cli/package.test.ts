import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
}

describe("CLI package entry", () => {
  it("publishes a miniagent executable backed by the built CLI entry", async () => {
    const pkg = await readJson("package.json");

    expect(pkg["bin"]).toEqual({
      miniagent: "./dist/cli/index.js",
    });
  });

  it("builds the CLI entry as part of the package build", async () => {
    const tsconfig = await readJson("tsconfig.json");
    const compilerOptions = tsconfig["compilerOptions"] as Record<string, unknown>;
    const excluded = tsconfig["exclude"] as string[];

    expect(compilerOptions["jsx"]).toBe("react-jsx");
    expect(compilerOptions["jsxImportSource"]).toBe("react");
    expect(excluded).not.toContain("src/cli");
  });

  it("keeps the compiled CLI directly executable by Node package managers", async () => {
    const entry = await readFile("src/cli/index.tsx", "utf-8");

    expect(entry.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });
});

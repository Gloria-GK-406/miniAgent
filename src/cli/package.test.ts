import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(path);
    }
    return [path];
  }));
  return nested.flat();
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

  it("keeps compiled test artifacts out of the published dist", async () => {
    const pkg = await readJson("package.json");
    const scripts = pkg["scripts"] as Record<string, unknown>;
    const tsconfig = await readJson("tsconfig.json");
    const excluded = tsconfig["exclude"] as string[];

    expect(excluded).toEqual(expect.arrayContaining([
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ]));
    expect(scripts["prebuild"]).toBe("node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"");
  });

  it("keeps the compiled CLI directly executable by Node package managers", async () => {
    const entry = await readFile("src/cli/index.tsx", "utf-8");

    expect(entry.startsWith("#!/usr/bin/env node\n")).toBe(true);
  });

  it("does not keep deprecated prototype approval or shell wording in product CLI source", async () => {
    const sourceFiles = (await listFiles("src/cli")).filter((path) =>
      /\.(?:ts|tsx)$/.test(path) &&
      !path.endsWith(".test.ts") &&
      !path.endsWith(".test.tsx"));
    const forbidden = [
      "allow" + "-all",
      ["executing", "bash", "commands"].join(" "),
    ];

    for (const path of sourceFiles) {
      const content = await readFile(path, "utf-8");
      for (const text of forbidden) {
        expect(content, `${path} contains ${text}`).not.toContain(text);
      }
    }
  });
});

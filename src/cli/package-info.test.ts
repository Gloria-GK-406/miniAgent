import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readPackageVersion } from "./package-info.js";

describe("readPackageVersion", () => {
  it("reads the version from package.json", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as { version?: unknown };

    expect(readPackageVersion()).toBe(pkg.version);
  });
});

import { describe, expect, it } from "vitest";
import { resolveWorkspacePath } from "./workspace.js";

describe("resolveWorkspacePath", () => {
  it("resolves relative paths inside the workspace", () => {
    const resolved = resolveWorkspacePath("C:/repo", "src/index.ts");
    expect(resolved.displayPath).toBe("src/index.ts");
  });

  it("rejects paths escaping the workspace by default", () => {
    expect(() => resolveWorkspacePath("C:/repo", "../outside.txt")).toThrow(
      "Path escapes workspace",
    );
  });
});

import { describe, expect, it, vi } from "vitest";
import { renderToString } from "ink";
import {
  DiffView,
  classifyDiffLine,
  getDiffWindow,
} from "./DiffView.js";

describe("classifyDiffLine", () => {
  it("classifies unified diff metadata before additions and removals", () => {
    expect(classifyDiffLine("diff --git a/src/a.ts b/src/a.ts")).toBe("file");
    expect(classifyDiffLine("--- a/src/a.ts")).toBe("file");
    expect(classifyDiffLine("+++ b/src/a.ts")).toBe("file");
    expect(classifyDiffLine("@@ -1,2 +1,3 @@")).toBe("hunk");
  });

  it("classifies changed lines by prefix", () => {
    expect(classifyDiffLine("+added")).toBe("add");
    expect(classifyDiffLine("-removed")).toBe("remove");
    expect(classifyDiffLine(" unchanged")).toBe("context");
  });
});

describe("getDiffWindow", () => {
  it("clamps the visible window to the available diff lines", () => {
    const window = getDiffWindow(["a", "b", "c", "d"], 2, 8);
    expect(window.visibleLines).toEqual(["c", "d"]);
    expect(window.maxOffset).toBe(2);
    expect(window.scrollOffset).toBe(2);
  });

  it("returns the top slice for the first page", () => {
    const window = getDiffWindow(["a", "b", "c"], 2, 0);
    expect(window.visibleLines).toEqual(["a", "b"]);
    expect(window.maxOffset).toBe(1);
    expect(window.scrollOffset).toBe(0);
  });
});

describe("DiffView", () => {
  it("renders title, line count, and diff content", () => {
    const output = renderToString(
      <DiffView
        title="Working Tree Diff"
        content={[
          "diff --git a/src/a.ts b/src/a.ts",
          "--- a/src/a.ts",
          "+++ b/src/a.ts",
          "@@ -1 +1 @@",
          "-old",
          "+new",
        ].join("\n")}
        onClose={vi.fn()}
      />,
    );

    expect(output).toContain("Working Tree Diff");
    expect(output).toContain("6 lines");
    expect(output).toContain("-old");
    expect(output).toContain("+new");
  });

  it("renders a friendly empty state", () => {
    const output = renderToString(
      <DiffView title="Git Status" content="" onClose={vi.fn()} />,
    );

    expect(output).toContain("Git Status");
    expect(output).toContain("No content");
  });
});

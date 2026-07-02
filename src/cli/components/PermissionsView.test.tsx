import { describe, expect, it, vi } from "vitest";
import { renderToString } from "ink";
import {
  PermissionsView,
  flattenPermissionRules,
} from "./PermissionsView.js";
import type { CLIPermissionConfig } from "../config.js";

const permission: CLIPermissionConfig = {
  "*": "ask",
  read: "allow",
  write: "ask",
  shell: {
    "*": "ask",
    "npm *": "allow",
    "rm *": "deny",
  },
};

describe("flattenPermissionRules", () => {
  it("flattens top-level and nested permission rules", () => {
    expect(flattenPermissionRules(permission)).toEqual([
      { target: "*", decision: "ask", reason: "global fallback" },
      { target: "read", decision: "allow", reason: "tool rule" },
      { target: "shell:*", decision: "ask", reason: "pattern rule" },
      { target: "shell:npm *", decision: "allow", reason: "pattern rule" },
      { target: "shell:rm *", decision: "deny", reason: "pattern rule" },
      { target: "write", decision: "ask", reason: "tool rule" },
    ]);
  });
});

describe("PermissionsView", () => {
  it("renders permission rules and auto approval state", () => {
    const output = renderToString(
      <PermissionsView
        permission={permission}
        autoApprove={true}
        onClose={vi.fn()}
      />,
    );

    expect(output).toContain("Permissions");
    expect(output).toContain("Auto approval: on");
    expect(output).toContain("ALLOW read");
    expect(output).toContain("DENY shell:rm *");
    expect(output).toContain("ASK write");
  });
});

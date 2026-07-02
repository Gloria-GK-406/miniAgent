import { describe, expect, it } from "vitest";
import { CLIConfigSchema, type CLIPermissionConfig } from "../config.js";
import { createPermissionService, matchCommandPattern } from "./permission-service.js";

describe("matchCommandPattern", () => {
  it("matches star patterns against shell commands", () => {
    expect(matchCommandPattern("npm *", "npm test")).toBe(true);
    expect(matchCommandPattern("git status*", "git status --short")).toBe(true);
    expect(matchCommandPattern("rm *", "npm test")).toBe(false);
  });
});

describe("PermissionService", () => {
  it("allows read tools by default", () => {
    const service = createPermissionService({
      "*": "ask",
      read: "allow",
    });

    expect(service.resolve({ toolName: "read", args: {} }, false)).toEqual({
      decision: "allow",
      reason: "tool rule read",
    });
  });

  it("enforces explicit deny even when auto approve is on", () => {
    const service = createPermissionService({
      "*": "ask",
      shell: {
        "*": "ask",
        "rm *": "deny",
      },
    });

    expect(service.resolve({
      toolName: "shell",
      args: { command: "rm -rf dist" },
    }, true)).toEqual({
      decision: "deny",
      reason: "shell pattern rm *",
    });
  });

  it("denies dangerous default shell patterns even when auto approve is on", () => {
    const config = CLIConfigSchema.parse({});
    const service = createPermissionService(config.permission);

    expect(service.resolve({
      toolName: "shell",
      args: { command: "rm -rf dist" },
    }, true)).toEqual({
      decision: "deny",
      reason: "shell pattern rm -rf *",
    });
    expect(service.resolve({
      toolName: "shell",
      args: { command: "Remove-Item -Recurse dist" },
    }, true)).toEqual({
      decision: "deny",
      reason: "shell pattern Remove-Item -Recurse *",
    });
  });

  it("auto allows ask decisions when auto approve is enabled", () => {
    const service = createPermissionService({ "*": "ask" });

    expect(service.resolve({ toolName: "edit", args: {} }, true)).toEqual({
      decision: "allow",
      reason: "auto approve",
    });
  });

  it("keeps ask when auto approve is disabled", () => {
    const config: CLIPermissionConfig = { "*": "ask", write: "ask" };
    const service = createPermissionService(config);

    expect(service.resolve({ toolName: "write", args: {} }, false)).toEqual({
      decision: "ask",
      reason: "tool rule write",
    });
  });

  it("uses updated config for future permission decisions", () => {
    const service = createPermissionService({ "*": "ask", write: "ask" });

    service.updateConfig({ "*": "ask", write: "deny" });

    expect(service.resolve({ toolName: "write", args: {} }, true)).toEqual({
      decision: "deny",
      reason: "tool rule write",
    });
  });
});

import { describe, expect, it } from "vitest";
import { CLIConfigSchema, type CLIPermissionConfig } from "../config.js";
import {
  createModeAwarePermissionService,
  createPermissionService,
  createSessionPermissionService,
  matchCommandPattern,
} from "./permission-service.js";

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

  it("applies session decisions to exact matching requests before config rules", () => {
    const service = createSessionPermissionService(
      createPermissionService({ "*": "ask", shell: "ask" }),
    );
    const request = { toolName: "shell", args: { command: "npm test" } };

    service.rememberSessionDecision(request, "allow");

    expect(service.resolve(request, false)).toEqual({
      decision: "allow",
      reason: "session rule shell",
    });
    expect(service.resolve({
      toolName: "shell",
      args: { command: "npm run lint" },
    }, false)).toEqual({
      decision: "ask",
      reason: "tool rule shell",
    });
  });

  it("matches session decisions with stable argument key order", () => {
    const service = createSessionPermissionService(
      createPermissionService({ "*": "ask" }),
    );

    service.rememberSessionDecision({
      toolName: "write",
      args: { path: "a.txt", content: "hello" },
    }, "allow");

    expect(service.resolve({
      toolName: "write",
      args: { content: "hello", path: "a.txt" },
    }, false)).toEqual({
      decision: "allow",
      reason: "session rule write",
    });
  });

  it("lets session denials override auto approval", () => {
    const service = createSessionPermissionService(
      createPermissionService({ "*": "ask" }),
    );
    const request = { toolName: "write", args: { path: "a.txt" } };

    service.rememberSessionDecision(request, "deny");

    expect(service.resolve(request, true)).toEqual({
      decision: "deny",
      reason: "session rule write",
    });
  });

  it("requires approval for plan-mode mutating tools allowed only by global rule", () => {
    const service = createModeAwarePermissionService({
      base: createPermissionService({ "*": "allow" }),
      getMode: () => "plan",
    });

    expect(service.resolve({ toolName: "write", args: { path: "a.txt" } }, true)).toEqual({
      decision: "ask",
      reason: "plan mode default write",
    });
    expect(service.resolve({ toolName: "read", args: { path: "a.txt" } }, true)).toEqual({
      decision: "allow",
      reason: "global rule *",
    });
  });

  it("honors explicit plan-mode mutating tool decisions without auto approval", () => {
    const service = createModeAwarePermissionService({
      base: createPermissionService({
        "*": "allow",
        edit: "ask",
        write: "allow",
        shell: {
          "*": "ask",
          "rm -rf *": "deny",
        },
      }),
      getMode: () => "plan",
    });

    expect(service.resolve({ toolName: "edit", args: { path: "a.txt" } }, true)).toEqual({
      decision: "ask",
      reason: "tool rule edit",
    });
    expect(service.resolve({ toolName: "write", args: { path: "a.txt" } }, true)).toEqual({
      decision: "allow",
      reason: "tool rule write",
    });
    expect(service.resolve({ toolName: "shell", args: { command: "npm test" } }, true)).toEqual({
      decision: "ask",
      reason: "shell pattern *",
    });
    expect(service.resolve({ toolName: "shell", args: { command: "rm -rf dist" } }, true)).toEqual({
      decision: "deny",
      reason: "shell pattern rm -rf *",
    });
  });
});

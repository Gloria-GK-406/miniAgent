import { describe, expect, it, vi } from "vitest";
import { createInputRouter } from "./input-router.js";

describe("InputRouter", () => {
  it("routes slash commands", async () => {
    const registry = { execute: vi.fn(async () => undefined) };
    const router = createInputRouter({
      commandRegistry: registry,
      shellService: { execute: vi.fn() },
      referenceService: { resolveReferences: vi.fn() },
    });

    await router.route({} as never, "/help");
    expect(registry.execute).toHaveBeenCalledWith(expect.anything(), "/help");
  });

  it("routes shell shortcuts", async () => {
    const shell = {
      execute: vi.fn(async () => ({
        stdout: "ok",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        aborted: false,
      })),
    };
    const router = createInputRouter({
      commandRegistry: { execute: vi.fn() },
      shellService: shell,
      referenceService: { resolveReferences: vi.fn() },
    });

    const result = await router.route({} as never, "!echo ok");

    expect(shell.execute).toHaveBeenCalledWith({ command: "echo ok" });
    expect(result).toEqual({ type: "shell", content: "ok" });
  });

  it("includes shell shortcut status when command output is empty or unsuccessful", async () => {
    const shell = {
      execute: vi.fn()
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "",
          exitCode: 7,
          timedOut: false,
          aborted: false,
        })
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "",
          exitCode: null,
          timedOut: true,
          aborted: false,
        })
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "",
          exitCode: null,
          timedOut: false,
          aborted: true,
        }),
    };
    const router = createInputRouter({
      commandRegistry: { execute: vi.fn() },
      shellService: shell,
      referenceService: { resolveReferences: vi.fn() },
    });

    await expect(router.route({} as never, "!exit 7")).resolves.toEqual({
      type: "shell",
      content: "[No output]\n[Exit code: 7]",
    });
    await expect(router.route({} as never, "!slow")).resolves.toEqual({
      type: "shell",
      content: "[No output]\n[Timed out]",
    });
    await expect(router.route({} as never, "!sleep")).resolves.toEqual({
      type: "shell",
      content: "[No output]\n[Aborted]",
    });
  });

  it("rejects denied shell shortcuts before execution", async () => {
    const shell = {
      execute: vi.fn(async () => ({
        stdout: "should not run",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        aborted: false,
      })),
    };
    const router = createInputRouter({
      commandRegistry: { execute: vi.fn() },
      shellService: shell,
      referenceService: { resolveReferences: vi.fn() },
      permissionService: {
        resolve: vi.fn(() => ({ decision: "deny", reason: "shell pattern rm *" })),
      },
      getAutoApprove: () => false,
      requestApproval: vi.fn(async () => true),
    });

    await expect(router.route({} as never, "!rm -rf dist")).rejects.toThrow(
      "Permission denied for shell shortcut: shell pattern rm *",
    );
    expect(shell.execute).not.toHaveBeenCalled();
  });

  it("asks before executing shell shortcuts with ask decisions", async () => {
    const shell = {
      execute: vi.fn(async () => ({
        stdout: "ok",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        aborted: false,
      })),
    };
    const requestApproval = vi.fn(async () => true);
    const router = createInputRouter({
      commandRegistry: { execute: vi.fn() },
      shellService: shell,
      referenceService: { resolveReferences: vi.fn() },
      permissionService: {
        resolve: vi.fn(() => ({ decision: "ask", reason: "shell pattern *" })),
      },
      getAutoApprove: () => false,
      requestApproval,
    });

    const result = await router.route({} as never, "!npm test");

    expect(requestApproval).toHaveBeenCalledWith("shell", { command: "npm test" });
    expect(shell.execute).toHaveBeenCalledWith({ command: "npm test" });
    expect(result).toEqual({ type: "shell", content: "ok" });
  });

  it("rejects shell shortcuts when approval is declined", async () => {
    const shell = {
      execute: vi.fn(async () => ({
        stdout: "should not run",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        aborted: false,
      })),
    };
    const router = createInputRouter({
      commandRegistry: { execute: vi.fn() },
      shellService: shell,
      referenceService: { resolveReferences: vi.fn() },
      permissionService: {
        resolve: vi.fn(() => ({ decision: "ask", reason: "shell pattern *" })),
      },
      getAutoApprove: () => false,
      requestApproval: vi.fn(async () => false),
    });

    await expect(router.route({} as never, "!npm test")).rejects.toThrow(
      "Permission rejected for shell shortcut",
    );
    expect(shell.execute).not.toHaveBeenCalled();
  });

  it("routes normal prompts with turn-only references", async () => {
    const refs = [{
      token: "@a.ts",
      path: "/repo/a.ts",
      displayPath: "a.ts",
      content: "const a = 1;",
    }];
    const router = createInputRouter({
      commandRegistry: { execute: vi.fn() },
      shellService: { execute: vi.fn() },
      referenceService: { resolveReferences: vi.fn(async () => refs) },
    });

    const result = await router.route({} as never, "Explain @a.ts");

    expect(result).toEqual({
      type: "prompt",
      content: "Explain @a.ts",
      references: refs,
    });
  });
});

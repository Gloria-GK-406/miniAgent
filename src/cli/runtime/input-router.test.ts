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

  it("routes normal prompts with references", async () => {
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
      content: [
        "Explain @a.ts",
        "",
        "[Referenced files]",
        "File: a.ts",
        "```",
        "const a = 1;",
        "```",
      ].join("\n"),
    });
  });
});

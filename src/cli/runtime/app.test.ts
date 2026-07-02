import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../../core/config.js";
import { createCLIRuntime } from "./app.js";

async function writeConfig(baseDir: string): Promise<void> {
  await mkdir(join(baseDir, ".cliagent"), { recursive: true });
  await writeFile(join(baseDir, ".cliagent", "config.json"), JSON.stringify({
    providers: [{
      engine: "openai",
      key: "sk-test",
      models: [{ id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] }],
    }],
    defaultModel: "fast",
  }), "utf-8");
}

describe("createCLIRuntime", () => {
  it("creates initial state and handles command input", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-"));
    await writeConfig(baseDir);

    const runtime = await createCLIRuntime(baseDir);
    await runtime.submitInput("/help");

    expect(runtime.getState().panel).toEqual({ type: "help" });
    await runtime.destroy();
  });

  it("creates, switches, and renames sessions from slash commands", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-sessions-"));
    await writeConfig(baseDir);

    const runtime = await createCLIRuntime(baseDir);
    const firstSessionId = runtime.getState().sessionId;

    await runtime.submitInput("/new feature work");
    const secondSessionId = runtime.getState().sessionId;

    expect(secondSessionId).not.toBe(firstSessionId);
    expect(runtime.getState().sessionName).toBe("feature work");
    expect(runtime.getState().sessions.map((session) => session.name)).toEqual(
      expect.arrayContaining(["default", "feature work"]),
    );

    await runtime.submitInput(`/sessions rename ${secondSessionId} renamed`);
    expect(runtime.getState().sessionName).toBe("renamed");

    await runtime.submitInput(`/sessions switch ${firstSessionId}`);
    expect(runtime.getState().sessionId).toBe(firstSessionId);
    expect(runtime.getState().sessionName).toBe("default");

    await runtime.destroy();
  });

  it("shows an error panel when deleting the last session", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-delete-last-"));
    await writeConfig(baseDir);

    const runtime = await createCLIRuntime(baseDir);
    await runtime.submitInput(`/sessions delete ${runtime.getState().sessionId}`);

    expect(runtime.getState().panel).toEqual({
      type: "error",
      message: "Cannot delete the last session",
    });
    await runtime.destroy();
  });
});

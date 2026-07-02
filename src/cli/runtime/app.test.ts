import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { ThinkingLevel } from "../../core/config.js";
import { MessageType, type Message } from "../../core/types.js";
import { createCLIRuntime } from "./app.js";
import { createCLISessionService } from "./session-service.js";
import { createSnapshotService } from "./snapshot-service.js";

function runGit(cwd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(stderr || `git ${args.join(" ")} failed`));
        return;
      }
      resolve();
    });
  });
}

async function writeConfig(baseDir: string, extra: Record<string, unknown> = {}): Promise<void> {
  await mkdir(join(baseDir, ".cliagent"), { recursive: true });
  await writeFile(join(baseDir, ".cliagent", "config.json"), JSON.stringify({
    providers: [{
      engine: "openai",
      key: "sk-test",
      models: [{ id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] }],
    }],
    defaultModel: "fast",
    ...extra,
  }), "utf-8");
}

describe("createCLIRuntime", () => {
  it("creates initial state and handles command input", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-"));
    await writeConfig(baseDir);
    await writeFile(join(baseDir, "README.md"), "readme", "utf-8");
    await mkdir(join(baseDir, "src"), { recursive: true });
    await writeFile(join(baseDir, "src", "index.ts"), "export {};\n", "utf-8");

    const runtime = await createCLIRuntime(baseDir);
    await runtime.submitInput("/help");

    expect(runtime.getState().panel).toEqual({ type: "help" });
    expect(runtime.getState().referencePaths).toEqual([
      "README.md",
      "src/index.ts",
    ]);
    await runtime.destroy();
  });

  it("refreshes reference paths after project initialization", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-reference-refresh-"));
    await writeConfig(baseDir);

    const runtime = await createCLIRuntime(baseDir);
    expect(runtime.getState().referencePaths).not.toContain("AGENTS.md");

    await runtime.submitInput("/init");

    expect(runtime.getState().referencePaths).toContain("AGENTS.md");
    await runtime.destroy();
  });

  it("loads and persists prompt input history", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-input-history-"));
    await writeConfig(baseDir);
    await writeFile(join(baseDir, ".cliagent", "input-history.json"), JSON.stringify({
      version: 1,
      entries: ["persisted"],
    }), "utf-8");

    const runtime = await createCLIRuntime(baseDir);
    expect(runtime.getState().inputHistory).toEqual(["persisted"]);

    await runtime.rememberInputHistory("  next  ");

    expect(runtime.getState().inputHistory).toEqual(["persisted", "next"]);
    await expect(readFile(join(baseDir, ".cliagent", "input-history.json"), "utf-8"))
      .resolves.toContain('"next"');
    await runtime.destroy();
  });

  it("edits permission policy from slash commands", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-permissions-"));
    await writeConfig(baseDir);

    const runtime = await createCLIRuntime(baseDir);
    await runtime.submitInput("/permissions set shell:npm * allow");

    expect(runtime.getState().config.permission.shell).toEqual({
      "*": "ask",
      "npm *": "allow",
    });
    expect(runtime.getState().panel).toEqual({
      type: "permissions",
      permission: runtime.getState().config.permission,
      autoApprove: false,
    });
    await expect(readFile(join(baseDir, ".cliagent", "config.json"), "utf-8"))
      .resolves.toContain('"npm *": "allow"');

    await runtime.destroy();
  });

  it("edits the system prompt from slash commands", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-system-prompt-"));
    await writeConfig(baseDir);

    const runtime = await createCLIRuntime(baseDir);
    await runtime.submitInput("/system set Custom project prompt");

    expect(runtime.getState().config.systemPrompt).toBe("Custom project prompt");
    expect(runtime.getState().panel).toEqual({
      type: "system",
      basePrompt: "Custom project prompt",
      effectivePrompt: expect.stringContaining("Custom project prompt"),
    });
    await expect(readFile(join(baseDir, ".cliagent", "config.json"), "utf-8"))
      .resolves.toContain('"systemPrompt": "Custom project prompt"');

    await runtime.destroy();
  });

  it("opens a doctor panel from slash commands", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-doctor-"));
    await writeConfig(baseDir);

    const runtime = await createCLIRuntime(baseDir);
    await runtime.submitInput("/doctor");

    expect(runtime.getState().panel).toEqual({
      type: "doctor",
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "configuration", status: "pass" }),
        expect.objectContaining({ id: "model", status: "pass" }),
      ]),
    });
    await runtime.destroy();
  });

  it("shows an error panel when a shell shortcut is denied", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-shell-deny-"));
    await writeConfig(baseDir, {
      permission: {
        "*": "ask",
        shell: {
          "*": "ask",
          "rm *": "deny",
        },
      },
    });

    const runtime = await createCLIRuntime(baseDir);
    await runtime.submitInput("!rm -rf dist");

    expect(runtime.getState().panel).toEqual({
      type: "error",
      message: "Permission denied for shell shortcut: shell pattern rm *",
    });
    await runtime.destroy();
  });

  it("opens an agents panel with configured subagents", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-agents-"));
    await writeConfig(baseDir, {
      subagent: {
        path: join(baseDir, ".cliagent", "subagent"),
      },
    });
    await mkdir(join(baseDir, ".cliagent", "subagent"), { recursive: true });
    await writeFile(join(baseDir, ".cliagent", "subagent", "reviewer.md"), [
      "---",
      "id: reviewer",
      "name: Reviewer",
      "description: Reviews code changes",
      "model: openai/fast",
      "---",
      "You review code.",
    ].join("\n"), "utf-8");

    const runtime = await createCLIRuntime(baseDir);
    await runtime.submitInput("/agent");

    expect(runtime.getState().panel).toEqual({
      type: "agents",
      mode: "build",
      subagents: [{
        id: "reviewer",
        name: "Reviewer",
        description: "Reviews code changes",
        model: "openai/fast",
        filePath: join(baseDir, ".cliagent", "subagent", "reviewer.md"),
      }],
    });
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

  it("exports and imports sessions from slash commands", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-export-"));
    await writeConfig(baseDir);

    const runtime = await createCLIRuntime(baseDir);
    await runtime.submitInput("/export json exported.json");
    const exported = JSON.parse(await readFile(join(baseDir, "exported.json"), "utf-8")) as {
      version: number;
      session: { name: string };
    };

    expect(exported.version).toBe(1);
    expect(exported.session.name).toBe("default");

    await runtime.submitInput("/import exported.json imported");

    expect(runtime.getState().sessionName).toBe("imported");
    await runtime.destroy();
  });

  it("registers project custom commands", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-custom-command-"));
    await writeConfig(baseDir);
    await mkdir(join(baseDir, ".cliagent", "commands"), { recursive: true });
    await writeFile(join(baseDir, ".cliagent", "commands", "shortcut.md"), [
      "---",
      "description: Open help",
      "---",
      "",
      "/help",
    ].join("\n"), "utf-8");

    const runtime = await createCLIRuntime(baseDir);
    await runtime.submitInput("/shortcut");

    expect(runtime.getState().panel).toEqual({ type: "help" });
    await runtime.destroy();
  });

  it("undoes and redoes the last turn with file snapshots", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-undo-"));
    await writeConfig(baseDir);
    const runtime = await createCLIRuntime(baseDir);
    const sessionId = runtime.getState().sessionId;
    const sessionService = await createCLISessionService(baseDir);
    const messages: Message[] = [
      { id: "u1", type: MessageType.User, content: "change file" },
      { id: "a1", type: MessageType.Assist, content: "changed" },
    ];
    await sessionService.writeMessages(sessionId, messages);
    await writeFile(join(baseDir, "a.txt"), "before", "utf-8");
    const snapshotService = createSnapshotService({
      baseDir,
      sessionService,
      getActiveSessionId: () => sessionId,
      getActiveTurnId: () => "u1",
    });
    await snapshotService.recordBeforeMutation("a.txt", async () => {
      await writeFile(join(baseDir, "a.txt"), "after", "utf-8");
    });

    await runtime.submitInput("/undo");

    expect(runtime.getState().messages).toEqual([]);
    await expect(readFile(join(baseDir, "a.txt"), "utf-8")).resolves.toBe("before");

    await runtime.submitInput("/redo");

    expect(runtime.getState().messages).toEqual(messages);
    await expect(readFile(join(baseDir, "a.txt"), "utf-8")).resolves.toBe("after");
    await runtime.destroy();
  });

  it("opens git and diff panels", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-git-"));
    await writeConfig(baseDir);
    await runGit(baseDir, ["init"]);
    await runGit(baseDir, ["config", "user.email", "test@example.com"]);
    await runGit(baseDir, ["config", "user.name", "MiniAgent Test"]);
    await writeFile(join(baseDir, "a.txt"), "one\n", "utf-8");
    await runGit(baseDir, ["add", "a.txt"]);
    await runGit(baseDir, ["commit", "-m", "initial"]);
    await writeFile(join(baseDir, "a.txt"), "two\n", "utf-8");

    const runtime = await createCLIRuntime(baseDir);
    await runtime.submitInput("/git status");

    expect(runtime.getState().panel).toEqual({
      type: "git",
      title: "Git Status",
      content: expect.stringContaining("a.txt"),
    });

    await runtime.submitInput("/diff a.txt");

    expect(runtime.getState().panel).toEqual({
      type: "diff",
      title: "Git Diff",
      content: expect.stringContaining("+two"),
    });
    await runtime.destroy();
  });
});

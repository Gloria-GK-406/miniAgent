import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatCommandList,
  formatCommandListJson,
  listAvailableCommands,
  runCommandList,
} from "./command-list-runner.js";

async function writeCustomCommand(baseDir: string, name: string, content: string): Promise<void> {
  await mkdir(join(baseDir, ".cliagent", "commands"), { recursive: true });
  await writeFile(join(baseDir, ".cliagent", "commands", `${name}.md`), content, "utf-8");
}

describe("formatCommandList", () => {
  it("formats visible commands as terminal text", () => {
    expect(formatCommandList([
      {
        name: "help",
        aliases: ["h"],
        description: "Show help",
        usage: "/help",
        source: "builtin",
      },
      {
        name: "review",
        aliases: [],
        description: "Review changes",
        usage: "/review [args]",
        source: "custom",
      },
    ])).toBe([
      "/help (/h) - Show help",
      "  usage: /help",
      "/review - Review changes [custom]",
      "  usage: /review [args]",
      "",
    ].join("\n"));
  });
});

describe("formatCommandListJson", () => {
  it("formats visible commands as json", () => {
    expect(formatCommandListJson([
      {
        name: "help",
        aliases: ["h"],
        description: "Show help",
        usage: "/help",
        source: "builtin",
      },
    ])).toBe([
      "{",
      "  \"commands\": [",
      "    {",
      "      \"name\": \"help\",",
      "      \"aliases\": [",
      "        \"h\"",
      "      ],",
      "      \"description\": \"Show help\",",
      "      \"usage\": \"/help\",",
      "      \"source\": \"builtin\"",
      "    }",
      "  ]",
      "}\n",
    ].join("\n"));
  });
});

describe("listAvailableCommands", () => {
  it("includes built-in and non-conflicting custom commands", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-command-list-"));
    await writeCustomCommand(baseDir, "review", [
      "---",
      "description: Review changes",
      "---",
      "",
      "Review: {{args}}",
    ].join("\n"));
    await writeCustomCommand(baseDir, "help", "Conflicts with builtin");

    const commands = await listAvailableCommands(baseDir);

    expect(commands.some((command) => command.name === "help" && command.source === "builtin")).toBe(true);
    expect(commands.some((command) => command.name === "review" && command.source === "custom")).toBe(true);
    expect(commands.filter((command) => command.name === "help")).toHaveLength(1);
    expect(commands.every((command) => command.name !== "panel-close")).toBe(true);
  });

  it("excludes custom commands whose aliases conflict with built-ins", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-command-list-alias-conflict-"));
    await writeCustomCommand(baseDir, "review", [
      "---",
      "description: Review changes",
      "aliases:",
      "  - h",
      "---",
      "",
      "Review: {{args}}",
    ].join("\n"));

    const commands = await listAvailableCommands(baseDir);

    expect(commands.some((command) => command.name === "review")).toBe(false);
  });
});

describe("runCommandList", () => {
  it("prints command list text", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-command-list-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runCommandList({ baseDir }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("/help"));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints command list json", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-command-list-"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runCommandList({
      baseDir,
      output: "json",
    }, { stdout, stderr })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining("\"commands\""));
    expect(stderr).not.toHaveBeenCalled();
  });

  it("prints custom command load errors as json when requested", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-command-list-"));
    await writeCustomCommand(baseDir, "broken", [
      "---",
      "description: Broken",
      "",
      "No closing frontmatter",
    ].join("\n"));
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runCommandList({
      baseDir,
      output: "json",
    }, { stdout, stderr })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"Custom command frontmatter is not closed\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
  });
});

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ThinkingLevel } from "../../core/config.js";
import { createCLIAgentFactory, formatResolvedModelPath } from "./agent-factory.js";
import { createPermissionService } from "./permission-service.js";
import { createShellService } from "./shell-service.js";

async function writeConfig(baseDir: string): Promise<void> {
  const configDir = join(baseDir, ".cliagent");
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, "config.json"), JSON.stringify({
    providers: [{
      engine: "openai",
      key: "sk-test",
      models: [{
        id: "fast",
        name: "gpt-4o-mini",
        thinkingLevels: [ThinkingLevel.None],
      }],
    }],
    defaultModel: "fast",
  }), "utf-8");
}

describe("createCLIAgentFactory", () => {
  it("builds a build-mode agent with resolved models and CLI-local tools", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-agent-factory-"));
    await writeConfig(baseDir);
    const factory = await createCLIAgentFactory({
      baseDir,
      mode: "build",
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: createShellService({ windows: "powershell", timeoutMs: 120000 }),
    });

    const built = await factory.build("session-1");

    expect(built.agent.getModels().map(formatResolvedModelPath)).toEqual(["openai/fast"]);
    expect(built.agent.getCurrentResolvedModel()).toMatchObject({ id: "fast", provider: "openai" });
    expect((await built.agent.getToolList()).map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "read",
      "edit",
      "write",
      "shell",
    ]));
    expect(built.compressor.getCompressedCount()).toBe(0);
  });
});

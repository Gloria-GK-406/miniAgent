import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ThinkingLevel } from "../../core/config.js";
import { MessageType } from "../../core/types.js";
import { loadConfig, type CLIAgentMode, type CLIConfig } from "../config.js";
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

  it("reads agent mode dynamically for each build", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-agent-factory-mode-"));
    await writeConfig(baseDir);
    let mode: CLIAgentMode = "build";
    const factory = await createCLIAgentFactory({
      baseDir,
      mode: () => mode,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: createShellService({ windows: "powershell", timeoutMs: 120000 }),
    });

    const buildAgent = await factory.build("session-build");
    const buildContext = await buildAgent.agent.previewContext();
    await buildAgent.agent.destroy();
    mode = "plan";
    const planAgent = await factory.build("session-plan");
    const planContext = await planAgent.agent.previewContext();
    await planAgent.agent.destroy();

    expect(buildContext.find((message) => message.type === MessageType.System)?.content)
      .toContain("Agent mode: build");
    expect(planContext.find((message) => message.type === MessageType.System)?.content)
      .toContain("Agent mode: plan");
  });

  it("reads runtime config dynamically for each build", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-agent-factory-config-"));
    await writeConfig(baseDir);
    let runtimeConfig: CLIConfig = {
      ...(await loadConfig(baseDir)),
      systemPrompt: "Initial prompt.",
    };
    const factory = await createCLIAgentFactory({
      baseDir,
      mode: "build",
      getConfig: () => runtimeConfig,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: createShellService({ windows: "powershell", timeoutMs: 120000 }),
    });

    const initialAgent = await factory.build("session-initial");
    const initialContext = await initialAgent.agent.previewContext();
    await initialAgent.agent.destroy();
    runtimeConfig = { ...runtimeConfig, systemPrompt: "Updated prompt." };
    const updatedAgent = await factory.build("session-updated");
    const updatedContext = await updatedAgent.agent.previewContext();
    await updatedAgent.agent.destroy();

    expect(initialContext.find((message) => message.type === MessageType.System)?.content)
      .toContain("Initial prompt.");
    expect(updatedContext.find((message) => message.type === MessageType.System)?.content)
      .toContain("Updated prompt.");
  });
});

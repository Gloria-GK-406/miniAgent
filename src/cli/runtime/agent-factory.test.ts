import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ThinkingLevel,
  type GenerationConfig,
  type ModelProviderConfig,
  type ResolvedModel,
} from "../../core/config.js";
import { MessageType } from "../../core/types.js";
import { loadConfig, type CLIAgentMode, type CLIConfig } from "../config.js";
import {
  buildSubagentAgentConfig,
  createCLIAgentFactory,
  formatResolvedModelPath,
  getResolvedModelPaths,
  resolveSubagentSessionId,
  selectResolvedModelForCLI,
} from "./agent-factory.js";
import { createPermissionService } from "./permission-service.js";
import { createShellService } from "./shell-service.js";

function resolvedModel(
  id: string,
  provider = "openai",
  name = id,
): ResolvedModel {
  return {
    id,
    provider,
    name,
    thinkingLevels: [ThinkingLevel.None],
  };
}

function toolCall(toolName: string, args: Record<string, unknown> = {}): {
  id: string;
  type: MessageType.ToolCall;
  content: string;
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
} {
  return {
    id: `${toolName}-message`,
    type: MessageType.ToolCall,
    content: "",
    toolCallId: `${toolName}-call`,
    toolName,
    arguments: args,
  };
}

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
      "diagnostics",
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

  it("guards mutating tools in plan mode even when global permissions allow", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-agent-factory-plan-permission-"));
    await writeConfig(baseDir);
    const requestApproval = vi.fn(async () => false);
    const factory = await createCLIAgentFactory({
      baseDir,
      mode: "plan",
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => true,
      requestApproval,
      shellService: createShellService({ windows: "powershell", timeoutMs: 120000 }),
    });
    const built = await factory.build("session-plan-permission");
    try {
      const write = (await built.agent.getToolList()).find((tool) => tool.name === "write")!;

      await expect(write.execute({ path: "planned.txt", content: "nope" }))
        .rejects.toThrow("Permission rejected for write");
      expect(requestApproval).toHaveBeenCalledWith("write", {
        path: "planned.txt",
        content: "nope",
      });
      await expect(readFile(join(baseDir, "planned.txt"), "utf-8"))
        .rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await built.agent.destroy();
    }
  });

  it("gates non-CLI blueprint tools with product permissions", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-agent-factory-approval-"));
    await writeConfig(baseDir);
    const requestApproval = vi.fn(async () => false);
    const factory = await createCLIAgentFactory({
      baseDir,
      mode: "build",
      permissionService: createPermissionService({ "*": "ask" }),
      getAutoApprove: () => false,
      requestApproval,
      shellService: createShellService({ windows: "powershell", timeoutMs: 120000 }),
    });
    const built = await factory.build("session-blueprint-approval");
    try {
      await expect(built.agent.execute(toolCall("todo_create", {
        title: "plan work",
      }))).resolves.toEqual(expect.objectContaining({
        content: "Tool execution denied by user.",
      }));
      expect(requestApproval).toHaveBeenCalledWith("todo_create", {
        title: "plan work",
      });
    } finally {
      await built.agent.destroy();
    }
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

  it("formats and selects resolved model paths", () => {
    const agent = {
      getModels: vi.fn(() => [
        resolvedModel("fast", "openai"),
        resolvedModel("deep", "anthropic"),
      ]),
      setResolvedModel: vi.fn(),
    };

    expect(getResolvedModelPaths(agent)).toEqual(["openai/fast", "anthropic/deep"]);
    expect(selectResolvedModelForCLI(agent, "anthropic/deep")).toMatchObject({
      id: "deep",
      provider: "anthropic",
    });
    expect(agent.setResolvedModel).toHaveBeenCalledWith({
      id: "deep",
      provider: "anthropic",
    });
  });

  it("selects a unique model by id and rejects ambiguous bare ids", () => {
    const uniqueAgent = {
      getModels: vi.fn(() => [resolvedModel("fast", "openai")]),
      setResolvedModel: vi.fn(),
    };
    selectResolvedModelForCLI(uniqueAgent, "fast");

    expect(uniqueAgent.setResolvedModel).toHaveBeenCalledWith({
      id: "fast",
      provider: "openai",
    });

    const ambiguousAgent = {
      getModels: vi.fn(() => [
        resolvedModel("fast", "openai"),
        resolvedModel("fast", "anthropic"),
      ]),
      setResolvedModel: vi.fn(),
    };

    expect(() => selectResolvedModelForCLI(ambiguousAgent, "fast")).toThrow(
      /Model selector is ambiguous: fast.*openai\/fast.*anthropic\/fast/,
    );
    expect(ambiguousAgent.setResolvedModel).not.toHaveBeenCalled();
  });

  it("builds provider-only subagent config from the parent resolved model", () => {
    const providers: ModelProviderConfig[] = [
      {
        provider: "openai",
        key: "test-key",
        models: [{ id: "fast", name: "gpt-4o-mini" }],
      },
    ];
    const generation: GenerationConfig = {
      temperature: 0.6,
      thinking: ThinkingLevel.Medium,
    };

    expect(buildSubagentAgentConfig({
      providers,
      currentModel: resolvedModel("fast", "openai", "gpt-4o-mini"),
      generation,
      paths: { sessiondir: "/tmp/subagent-session" },
    })).toEqual({
      providers,
      defaultModel: { id: "fast", provider: "openai" },
      generation,
      paths: { sessiondir: "/tmp/subagent-session" },
    });
  });

  it("resolves subagent session ids from the runtime active session first", () => {
    expect(resolveSubagentSessionId(() => "runtime-session", "factory-session"))
      .toBe("runtime-session");
    expect(resolveSubagentSessionId(undefined, "factory-session"))
      .toBe("factory-session");
    expect(resolveSubagentSessionId(undefined, undefined))
      .toBe("temp");
  });

  it("rejects unknown provider engines while building the runtime agent", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-agent-factory-unknown-"));
    const configDir = join(baseDir, ".cliagent");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.json"), JSON.stringify({
      providers: [{
        engine: "not-real",
        key: "sk-test",
        models: [{ id: "custom", name: "custom-model" }],
      }],
      defaultModel: "custom",
    }), "utf-8");
    const factory = await createCLIAgentFactory({
      baseDir,
      mode: "build",
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: createShellService({ windows: "powershell", timeoutMs: 120000 }),
    });

    await expect(factory.build("session-unknown")).rejects.toThrow(
      "Unknown blueprint implementation: engine/not-real.",
    );
  });
});

import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ThinkingLevel,
  type GenerationConfig,
} from "../../core/index.js";
import type { MiniAgent } from "../../core/index.js";
import { MessageType } from "../../core/index.js";
import {
  CLIConfigSchema,
  loadConfig,
  type CLIAgentMode,
  type CLIConfig,
} from "../config.js";
import {
  buildSubagentAgentConfig,
  createCLIAgentFactory,
  getConfiguredModelPaths,
  resolveSubagentSessionId,
  selectModelForCLI,
} from "./agent-factory.js";
import { createPermissionService } from "./permission-service.js";
import { createShellService } from "./shell-service.js";

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

    expect(getConfiguredModelPaths(built.config)).toEqual(["openai/fast"]);
    expect(built.agent.getModel()).toMatchObject({
      provider: "openai",
      model: { name: "gpt-4o-mini" },
    });
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

  it("exposes the todo manager used by the parent agent", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-agent-factory-todos-"));
    await writeConfig(baseDir);
    const factory = await createCLIAgentFactory({
      baseDir,
      mode: "build",
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: createShellService({ windows: "powershell", timeoutMs: 120000 }),
    });
    const built = await factory.build("session-todos");
    try {
      const createTodo = (await built.agent.getToolList())
        .find((tool) => tool.name === "todo_create");
      if (createTodo === undefined) {
        throw new Error("todo_create was not registered");
      }
      await expect(createTodo.execute({
        content: "Track current work",
      })).resolves.toBe("Created todo [pending]: Track current work");

      expect(built.todoManager.listTodos()).toEqual([
        expect.objectContaining({
          content: "Track current work",
          status: "pending",
        }),
      ]);
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
    const config = CLIConfigSchema.parse({ providers: [
      { engine: "openai", key: "openai-key", models: [{ id: "fast", name: "gpt" }] },
      { engine: "anthropic", key: "anthropic-key", models: [{ id: "deep", name: "claude" }] },
    ] });
    const setModel = vi.fn();
    const agent = { setModel } as unknown as MiniAgent;

    expect(getConfiguredModelPaths(config)).toEqual(["openai/fast", "anthropic/deep"]);
    expect(selectModelForCLI(agent, config, "anthropic/deep")).toMatchObject({
      provider: "anthropic",
      model: { id: "deep" },
    });
    expect(setModel).toHaveBeenCalledWith({
      provider: "anthropic",
      key: "anthropic-key",
      model: { name: "claude", thinkingLevels: [ThinkingLevel.None] },
    });
  });

  it("selects a unique model by id and rejects ambiguous bare ids", () => {
    const setModel = vi.fn();
    const agent = { setModel } as unknown as MiniAgent;
    const uniqueConfig = CLIConfigSchema.parse({ providers: [
      { engine: "openai", key: "key", models: [{ id: "fast", name: "gpt" }] },
    ] });
    selectModelForCLI(agent, uniqueConfig, "fast");

    expect(setModel).toHaveBeenCalledWith({
      provider: "openai",
      key: "key",
      model: { name: "gpt", thinkingLevels: [ThinkingLevel.None] },
    });

    const ambiguousConfig = CLIConfigSchema.parse({ providers: [
      { engine: "openai", key: "key", models: [{ id: "fast", name: "gpt" }] },
      { engine: "anthropic", key: "key", models: [{ id: "fast", name: "claude" }] },
    ] });

    expect(() => selectModelForCLI(agent, ambiguousConfig, "fast")).toThrow(
      /Model selector is ambiguous: fast.*openai\/fast.*anthropic\/fast/,
    );
  });

  it("builds subagent config without provider catalogs", () => {
    const generation: GenerationConfig = {
      temperature: 0.6,
      thinking: ThinkingLevel.Medium,
    };

    expect(buildSubagentAgentConfig({
      generation,
      paths: { sessiondir: "/tmp/subagent-session" },
    })).toEqual({
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

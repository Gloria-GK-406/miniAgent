import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MiniAgent } from "../core/agent.js";
import { ThinkingLevel } from "../core/config.js";
import type {
  GenerationConfig,
  ModelProviderConfig,
  ResolvedModel,
} from "../core/config.js";
import { MessageType, type Message, type ToolCallMessage } from "../core/types.js";
import {
  buildSubagentAgentConfig,
  createCLIApp,
  formatResolvedModelPath,
  getResolvedModelPaths,
  selectResolvedModelForCLI,
} from "./cli-app.js";

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

function messages(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `message-${index}`,
    type: MessageType.User,
    content: `message ${index}`,
  }));
}

function toolCall(toolName: string): ToolCallMessage {
  return {
    id: crypto.randomUUID(),
    type: MessageType.ToolCall,
    content: "",
    toolCallId: crypto.randomUUID(),
    toolName,
    arguments: {},
  };
}

describe("createCLIApp", () => {
  it("boots from provider-only config and uses resolved model APIs", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-cli-"));
    const configDir = join(baseDir, ".cliagent");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        providers: [
          {
            engine: "openai",
            key: "sk-test",
            models: [
              {
                id: "fast",
                name: "gpt-4o-mini",
                thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
              },
            ],
          },
        ],
        defaultModel: "fast",
        generation: {
          temperature: 0.1,
          thinking: ThinkingLevel.Low,
        },
      }),
      "utf-8",
    );

    const app = await createCLIApp(baseDir);
    const current = app.agent.getCurrentResolvedModel();

    expect(current).toMatchObject({
      id: "fast",
      provider: "openai",
      name: "gpt-4o-mini",
    });
    expect(app.agent.getGenerationConfig()).toMatchObject({
      temperature: 0.1,
      thinking: ThinkingLevel.Low,
    });
    expect(app.agent.getModels().map(formatResolvedModelPath)).toEqual(["openai/fast"]);
    expect(app.agent.getConfig()).not.toHaveProperty("model");
    expect(app.agent.getConfig()).not.toHaveProperty("models");
    expect(app.agent.getConfig()).not.toHaveProperty("plugins");
    expect(app.compressor.getCompressedCount()).toBe(0);
    expect(app).not.toHaveProperty("assembler");
    expect(app).not.toHaveProperty("manager");
    expect(app).not.toHaveProperty("blueprintRegistry");
  });

  it("destroys the previous agent before replacing it during rebuild", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-cli-"));
    const configDir = join(baseDir, ".cliagent");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        providers: [],
      }),
      "utf-8",
    );

    const app = await createCLIApp(baseDir);
    const firstAgent = app.agent;
    const destroySpy = vi.spyOn(
      firstAgent as typeof firstAgent & { destroy: () => Promise<void> },
      "destroy",
    );

    const rebuilt = await app.rebuildAgent(app.session.id);

    expect(destroySpy).toHaveBeenCalledOnce();
    expect(rebuilt).not.toBe(firstAgent);
  });

  it("serializes concurrent rebuilds so overwritten rebuilt agents are destroyed", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-cli-"));
    const configDir = join(baseDir, ".cliagent");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        providers: [],
      }),
      "utf-8",
    );

    const app = await createCLIApp(baseDir);
    const destroySpy = vi.spyOn(MiniAgent.prototype, "destroy");

    try {
      const [firstRebuilt, secondRebuilt] = await Promise.all([
        app.rebuildAgent(app.session.id),
        app.rebuildAgent(app.session.id),
      ]);

      expect(firstRebuilt).not.toBe(secondRebuilt);
      expect(destroySpy.mock.contexts).toContain(app.agent);
      expect(destroySpy.mock.contexts).toContain(firstRebuilt);
    } finally {
      destroySpy.mockRestore();
    }
  });

  it("uses the active agent config when the CLI compressor runs", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-cli-"));
    const configDir = join(baseDir, ".cliagent");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        providers: [],
      }),
      "utf-8",
    );

    const app = await createCLIApp(baseDir);
    const getConfigSpy = vi.spyOn(app.agent, "getConfig");

    app.agent.setGenerationConfig({
      temperature: 0.2,
      thinking: ThinkingLevel.High,
    });
    app.compressor.updateMessages(messages(61));
    await app.compressor.maybeCompress();

    expect(getConfigSpy).toHaveBeenCalled();
  });

  it("allows non-auto-approved tools while CLI HITL is enabled", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-cli-"));
    const configDir = join(baseDir, ".cliagent");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        providers: [],
      }),
      "utf-8",
    );

    const app = await createCLIApp(baseDir);

    await expect(app.agent.execute(toolCall("bash")))
      .resolves.toEqual(expect.objectContaining({ content: "tool not found: bash" }));
  });

  it("formats resolved models for CLI display", () => {
    const agent = {
      getModels: vi.fn(() => [
        resolvedModel("fast", "openai"),
        resolvedModel("deep", "anthropic"),
      ]),
    };

    expect(getResolvedModelPaths(agent)).toEqual(["openai/fast", "anthropic/deep"]);
  });

  it("switches models with setResolvedModel using id and provider", () => {
    const agent = {
      getModels: vi.fn(() => [
        resolvedModel("fast", "openai"),
        resolvedModel("deep", "anthropic"),
      ]),
      setResolvedModel: vi.fn(),
      setGenerationConfig: vi.fn(),
    };

    const selected = selectResolvedModelForCLI(agent, "anthropic/deep");

    expect(selected).toMatchObject({ id: "deep", provider: "anthropic" });
    expect(agent.setResolvedModel).toHaveBeenCalledWith({
      id: "deep",
      provider: "anthropic",
    });
    expect(agent.setGenerationConfig).not.toHaveBeenCalled();
  });

  it("selects a unique model by id without applying model-level generation", () => {
    const agent = {
      getModels: vi.fn(() => [resolvedModel("fast", "openai")]),
      setResolvedModel: vi.fn(),
      setGenerationConfig: vi.fn(),
    };

    selectResolvedModelForCLI(agent, "fast");

    expect(agent.setResolvedModel).toHaveBeenCalledWith({
      id: "fast",
      provider: "openai",
    });
    expect(agent.setGenerationConfig).not.toHaveBeenCalled();
  });

  it("rejects ambiguous bare model ids with provider-qualified choices", () => {
    const agent = {
      getModels: vi.fn(() => [
        resolvedModel("fast", "openai"),
        resolvedModel("fast", "anthropic"),
      ]),
      setResolvedModel: vi.fn(),
    };

    expect(() => selectResolvedModelForCLI(agent, "fast")).toThrow(
      /Model selector is ambiguous: fast.*openai\/fast.*anthropic\/fast/,
    );
    expect(agent.setResolvedModel).not.toHaveBeenCalled();
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
    const config = buildSubagentAgentConfig({
      providers,
      currentModel: resolvedModel("fast", "openai", "gpt-4o-mini"),
      generation,
      paths: { sessiondir: "/tmp/subagent-session" },
    });

    expect(config).toEqual({
      providers,
      defaultModel: { id: "fast", provider: "openai" },
      generation,
      paths: { sessiondir: "/tmp/subagent-session" },
    });
    expect(config).not.toHaveProperty("model");
    expect(config).not.toHaveProperty("models");
    expect(config).not.toHaveProperty("plugins");
  });

  it("rejects unknown provider engines at startup", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-cli-"));
    const configDir = join(baseDir, ".cliagent");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        providers: [
          {
            engine: "not-real",
            key: "sk-test",
            models: [{ id: "custom", name: "custom-model" }],
          },
        ],
        defaultModel: "custom",
      }),
      "utf-8",
    );

    await expect(createCLIApp(baseDir)).rejects.toThrow(
      "Unknown blueprint implementation: engine/not-real.",
    );
  });
});

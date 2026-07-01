import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../core/config.js";
import {
  applyLegacyGenerationForModel,
  createCLIApp,
} from "./cli-app.js";
import { CLIConfigSchema } from "./config.js";

describe("createCLIApp", () => {
  it("boots from provider-only config and engine catalog default model", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-cli-"));
    const configDir = join(baseDir, ".cliagent");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        providers: [
          {
            name: "anthropic-main",
            engine: "anthropic",
            apiKey: "sk-test",
          },
        ],
        defaultModel: "anthropic-main/claude-sonnet-4-5",
        generation: {
          temperature: 0.1,
          thinking: ThinkingLevel.Low,
        },
      }),
      "utf-8",
    );

    const app = await createCLIApp(baseDir);

    expect(app.agent.getCurrentResolvedModel().id).toBe("anthropic-main/claude-sonnet-4-5");
    expect(app.agent.getGenerationConfig()).toMatchObject({
      temperature: 0.1,
      thinking: ThinkingLevel.Low,
    });
    expect(app.agent.getResolvedModels().map((model) => model.id)).toContain(
      "anthropic-main/claude-sonnet-4-5",
    );
  });

  it("preserves legacy top-level model generation fields", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-cli-"));
    const configDir = join(baseDir, ".cliagent");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        providers: [
          {
            name: "main",
            provider: "openai-compatible",
            apiKey: "sk-test",
            baseUrl: "https://example.test/v1",
          },
        ],
        models: [
          {
            name: "fast",
            provider: "main",
            model: "custom-fast",
            temperature: 0.3,
            topP: 0.8,
            maxOutputTokens: 2048,
            thinking: false,
          },
        ],
        defaultModel: "fast",
      }),
      "utf-8",
    );

    const app = await createCLIApp(baseDir);

    expect(app.agent.getCurrentResolvedModel().id).toBe("main/custom-fast");
    expect(app.agent.getGenerationConfig()).toEqual({
      temperature: 0.3,
      topP: 0.8,
      maxOutputTokens: 2048,
      thinking: ThinkingLevel.None,
    });
  });

  it("updates legacy generation after resolved model switches", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-cli-"));
    const configDir = join(baseDir, ".cliagent");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        providers: [
          {
            name: "main",
            provider: "openai-compatible",
            apiKey: "sk-test",
            baseUrl: "https://example.test/v1",
          },
        ],
        models: [
          {
            name: "fast",
            provider: "main",
            model: "custom-fast",
            temperature: 0.2,
            maxTokens: 1024,
          },
          {
            name: "deep",
            provider: "main",
            model: "custom-deep",
            temperature: 0.6,
            maxOutputTokens: 4096,
            thinking: true,
          },
        ],
        defaultModel: "fast",
      }),
      "utf-8",
    );
    const app = await createCLIApp(baseDir);

    app.agent.setResolvedModel({ id: "main/custom-deep" });
    applyLegacyGenerationForModel(app.agent, app.config, "main/custom-deep");

    expect(app.agent.getGenerationConfig()).toMatchObject({
      temperature: 0.6,
      maxOutputTokens: 4096,
      thinking: ThinkingLevel.Medium,
    });
  });

  it("clears stale optional generation fields after legacy model switches", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-cli-"));
    const configDir = join(baseDir, ".cliagent");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "config.json"),
      JSON.stringify({
        providers: [
          {
            name: "main",
            provider: "openai-compatible",
            apiKey: "sk-test",
            baseUrl: "https://example.test/v1",
          },
        ],
        models: [
          {
            name: "rich",
            provider: "main",
            model: "custom-rich",
            temperature: 0.4,
            topP: 0.8,
            maxTokens: 2048,
          },
          {
            name: "plain",
            provider: "main",
            model: "custom-plain",
            temperature: 0.6,
          },
        ],
        defaultModel: "rich",
      }),
      "utf-8",
    );
    const app = await createCLIApp(baseDir);

    app.agent.setResolvedModel({ id: "main/custom-plain" });
    applyLegacyGenerationForModel(app.agent, app.config, "main/custom-plain");

    expect(app.agent.getGenerationConfig()).toMatchObject({
      temperature: 0.6,
      thinking: ThinkingLevel.Medium,
    });
    expect(app.agent.getGenerationConfig().topP).toBeUndefined();
    expect(app.agent.getGenerationConfig().maxOutputTokens).toBeUndefined();
  });

  it("does not override explicit top-level generation on model switches", async () => {
    const config = CLIConfigSchema.parse({
      providers: [
        {
          name: "main",
          provider: "openai-compatible",
          apiKey: "sk-test",
        },
      ],
      models: [
        {
          name: "fast",
          provider: "main",
          model: "custom-fast",
          temperature: 0.2,
        },
      ],
      defaultModel: "fast",
      generation: {
        temperature: 0.9,
        thinking: ThinkingLevel.High,
      },
    });
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-cli-"));
    const configDir = join(baseDir, ".cliagent");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.json"), JSON.stringify(config), "utf-8");
    const app = await createCLIApp(baseDir);

    applyLegacyGenerationForModel(app.agent, app.config, "main/custom-fast");

    expect(app.agent.getGenerationConfig()).toMatchObject({
      temperature: 0.9,
      thinking: ThinkingLevel.High,
    });
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
            name: "mystery",
            engine: "not-real",
            apiKey: "sk-test",
            models: {
              add: [{ model: "custom-model" }],
            },
          },
        ],
        defaultModel: "mystery/custom-model",
      }),
      "utf-8",
    );

    await expect(createCLIApp(baseDir)).rejects.toThrow(
      'Unsupported engine "not-real" for provider "mystery"',
    );
  });
});

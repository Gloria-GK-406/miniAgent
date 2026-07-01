import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../core/config.js";
import { createCLIApp } from "./cli-app.js";

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
});

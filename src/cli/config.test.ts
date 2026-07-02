import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../core/config.js";
import {
  CLIConfigSchema,
  parseDefaultModel,
  toAgentGenerationConfig,
  toAgentProviders,
} from "./config.js";

describe("CLI config provider mode", () => {
  it("rejects top-level legacy models", () => {
    const result = CLIConfigSchema.safeParse({
      providers: [
        {
          engine: "openai",
          key: "test-key",
        },
      ],
      models: [
        {
          name: "fast",
          provider: "openai",
          model: "gpt-4o-mini",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects provider objects using legacy provider instead of engine", () => {
    const result = CLIConfigSchema.safeParse({
      providers: [
        {
          provider: "openai",
          key: "test-key",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects provider objects missing key", () => {
    const result = CLIConfigSchema.safeParse({
      providers: [
        {
          engine: "openai",
          models: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects provider objects missing models", () => {
    const result = CLIConfigSchema.safeParse({
      providers: [
        {
          engine: "openai",
          key: "test-key",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("parses provider-mode config", () => {
    const config = CLIConfigSchema.parse({
      providers: [
        {
          engine: "openai",
          key: "test-key",
          models: [{ id: "fast", name: "gpt-4o-mini" }],
        },
      ],
      defaultModel: "fast",
      generation: { temperature: 0.6, thinking: "medium" },
    });

    expect(config).toEqual({
      providers: [
        {
          engine: "openai",
          key: "test-key",
          models: [{ id: "fast", name: "gpt-4o-mini" }],
        },
      ],
      defaultModel: "fast",
      generation: { temperature: 0.6, thinking: ThinkingLevel.Medium },
    });
    expect(parseDefaultModel(config)).toEqual({ id: "fast" });
    expect(toAgentGenerationConfig(config)).toEqual({
      temperature: 0.6,
      thinking: ThinkingLevel.Medium,
    });
  });

  it("converts CLI engine providers to agent provider configs", () => {
    const config = CLIConfigSchema.parse({
      providers: [
        {
          engine: "openai",
          key: "test-key",
          baseURL: "https://example.test/v1",
          models: [
            {
              id: "fast",
              name: "gpt-4o-mini",
              displayName: "Fast",
              thinkingLevels: [ThinkingLevel.None],
            },
          ],
        },
      ],
      defaultModel: "openai/fast",
    });

    expect(parseDefaultModel(config)).toEqual({
      id: "fast",
      provider: "openai",
    });
    expect(toAgentProviders(config)).toEqual([
      {
        provider: "openai",
        key: "test-key",
        baseUrl: "https://example.test/v1",
        models: [
          {
            id: "fast",
            name: "gpt-4o-mini",
            displayName: "Fast",
            thinkingLevels: [ThinkingLevel.None],
          },
        ],
      },
    ]);
  });

  it("keeps mcp, skill, and subagent convenience config on CLIConfig only", () => {
    const config = CLIConfigSchema.parse({
      providers: [
        {
          engine: "openai",
          key: "test-key",
          models: [{ id: "fast", name: "gpt-4o-mini" }],
        },
      ],
      mcp: {
        servers: {
          fs: {
            transport: "stdio",
            command: "mcp-fs",
          },
        },
      },
      skill: {
        directories: ["/tmp/skills"],
      },
      subagent: {
        path: "/tmp/subagents",
      },
    });

    expect(config.mcp).toEqual({
      servers: {
        fs: {
          transport: "stdio",
          command: "mcp-fs",
        },
      },
    });
    expect(config.skill).toEqual({ directories: ["/tmp/skills"] });
    expect(config.subagent).toEqual({ path: "/tmp/subagents" });
    expect(toAgentProviders(config)).toEqual([
      {
        provider: "openai",
        key: "test-key",
        models: [{ id: "fast", name: "gpt-4o-mini" }],
      },
    ]);
  });

  it("does not derive generation from model presets", () => {
    const config = CLIConfigSchema.parse({
      providers: [
        {
          engine: "openai",
          key: "test-key",
          models: [
            {
              id: "fast",
              name: "gpt-4o-mini",
              maxOutputTokens: 4096,
              thinkingLevels: [ThinkingLevel.None],
            },
          ],
        },
      ],
      defaultModel: "fast",
    });

    expect(toAgentGenerationConfig(config)).toBeUndefined();
  });
});

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ThinkingLevel } from "../core/config.js";
import {
  CLIConfigSchema,
  getGlobalConfigPath,
  loadConfig,
  parseDefaultModel,
  toAgentGenerationConfig,
  toAgentProviders,
} from "./config.js";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf-8");
}

function provider(id: string) {
  return {
    engine: "openai",
    key: `sk-${id}`,
    models: [{ id, name: `model-${id}` }],
  };
}

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

    expect(config).toMatchObject({
      providers: [
        {
          engine: "openai",
          key: "test-key",
          models: [{ id: "fast", name: "gpt-4o-mini" }],
        },
      ],
      defaultModel: "fast",
      defaultAgent: "build",
      generation: { temperature: 0.6, thinking: ThinkingLevel.Medium },
      permission: {
        "*": "ask",
        read: "allow",
        glob: "allow",
        grep: "allow",
      },
      shell: {
        windows: "powershell",
        timeoutMs: 120000,
      },
      tui: {
        showReasoning: false,
        showToolDetails: false,
      },
    });
    expect(parseDefaultModel(config)).toEqual({ id: "fast" });
    expect(toAgentGenerationConfig(config)).toEqual({
      temperature: 0.6,
      thinking: ThinkingLevel.Medium,
    });
  });

  it("parses product runtime config defaults", () => {
    const config = CLIConfigSchema.parse({});

    expect(config).toMatchObject({
      providers: [],
      defaultModel: "",
      defaultAgent: "build",
      permission: {
        "*": "ask",
        read: "allow",
        glob: "allow",
        grep: "allow",
      },
      shell: {
        windows: "powershell",
        timeoutMs: 120000,
      },
      tui: {
        showReasoning: false,
        showToolDetails: false,
      },
    });
  });

  it("parses external editor config", () => {
    const config = CLIConfigSchema.parse({
      editor: {
        executable: "code",
        args: ["--wait"],
        wait: true,
      },
    });

    expect(config.editor).toEqual({
      executable: "code",
      args: ["--wait"],
      wait: true,
    });
  });

  it("parses diagnostics config", () => {
    const config = CLIConfigSchema.parse({
      diagnostics: {
        commands: ["npm run typecheck", "npm run lint"],
        timeoutMs: 30000,
      },
    });

    expect(config.diagnostics).toEqual({
      commands: ["npm run typecheck", "npm run lint"],
      timeoutMs: 30000,
    });
  });

  it("parses nested shell permission patterns", () => {
    const config = CLIConfigSchema.parse({
      permission: {
        "*": "ask",
        shell: {
          "*": "ask",
          "npm *": "allow",
          "rm *": "deny",
        },
      },
    });

    expect(config.permission.shell).toEqual({
      "*": "ask",
      "npm *": "allow",
      "rm *": "deny",
    });
  });

  it("rejects invalid agent and permission values", () => {
    expect(CLIConfigSchema.safeParse({ defaultAgent: "review" }).success).toBe(false);
    expect(CLIConfigSchema.safeParse({ permission: { read: "sometimes" } }).success).toBe(false);
    expect(CLIConfigSchema.safeParse({ shell: { windows: "fish" } }).success).toBe(false);
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

  it("resolves global config paths per platform", () => {
    expect(getGlobalConfigPath({
      platform: "win32",
      env: { APPDATA: "C:/Users/Test/AppData/Roaming" },
      homeDir: "C:/Users/Test",
    }).replaceAll("\\", "/")).toBe("C:/Users/Test/AppData/Roaming/miniagent/config.json");

    expect(getGlobalConfigPath({
      platform: "linux",
      env: { XDG_CONFIG_HOME: "/home/test/.config-root" },
      homeDir: "/home/test",
    })).toBe("/home/test/.config-root/miniagent/config.json");

    expect(getGlobalConfigPath({
      platform: "linux",
      env: {},
      homeDir: "/home/test",
    })).toBe("/home/test/.config/miniagent/config.json");
  });

  it("loads global config when project config is absent", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-config-project-"));
    const globalRoot = await mkdtemp(join(tmpdir(), "miniagent-config-global-"));
    await writeJson(join(globalRoot, "miniagent", "config.json"), {
      providers: [provider("global")],
      defaultModel: "global",
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`exit ${String(code)}`);
    }) as never);

    try {
      await expect(loadConfig(baseDir, {
        platform: "linux",
        env: { XDG_CONFIG_HOME: globalRoot },
        homeDir: globalRoot,
      })).resolves.toMatchObject({
        providers: [provider("global")],
        defaultModel: "global",
      });
      expect(exit).not.toHaveBeenCalled();
    } finally {
      exit.mockRestore();
    }
  });

  it("merges global config with project config and lets project values win", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-config-merge-"));
    const globalRoot = await mkdtemp(join(tmpdir(), "miniagent-config-global-"));
    await writeJson(join(globalRoot, "miniagent", "config.json"), {
      providers: [provider("global")],
      defaultModel: "global",
      permission: {
        "*": "ask",
        read: "allow",
        write: "ask",
      },
      shell: {
        windows: "powershell",
        timeoutMs: 60000,
      },
    });
    await writeJson(join(baseDir, ".cliagent", "config.json"), {
      providers: [provider("project")],
      defaultModel: "project",
      permission: {
        write: "deny",
      },
      shell: {
        timeoutMs: 30000,
      },
    });

    await expect(loadConfig(baseDir, {
      platform: "linux",
      env: { XDG_CONFIG_HOME: globalRoot },
      homeDir: globalRoot,
    })).resolves.toMatchObject({
      providers: [provider("project")],
      defaultModel: "project",
      permission: {
        "*": "ask",
        read: "allow",
        write: "deny",
      },
      shell: {
        windows: "powershell",
        timeoutMs: 30000,
      },
    });
  });
});

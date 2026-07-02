import { describe, expect, it, vi } from "vitest";
import { MessageType, type Message } from "../../core/types.js";
import { CLIConfigSchema } from "../config.js";
import { createCommandRegistry } from "../runtime/command-registry.js";
import type { CLICommandContext, CLIState } from "../runtime/types.js";
import { registerBuiltinCommands } from "./builtin.js";

function state(): CLIState {
  return {
    baseDir: process.cwd(),
    config: CLIConfigSchema.parse({}),
    mode: "build",
    modelName: "openai/fast",
    modelPaths: ["openai/fast"],
    commandSuggestions: [],
    commandHelp: [],
    referencePaths: [],
    inputHistory: [],
    sessionId: "s1",
    sessionName: "default",
    sessions: [],
    autoApprove: false,
    showReasoning: false,
    showToolDetails: false,
    isRunning: false,
    currentTool: null,
    messages: [],
    streamingText: "",
    reasoningText: "",
    turnCount: 0,
    tokenUsage: { input: 0, output: 0, total: 0 },
    activity: [],
    panel: { type: "none" },
    approval: null,
    error: null,
    exitRequested: false,
  };
}

function ctx(): CLICommandContext {
  let current = state();
  return {
    runtime: {
      setAgentMode: vi.fn(async (mode) => {
        current = { ...current, mode };
      }),
      requestExit: vi.fn(async () => undefined),
      rebuildAgent: vi.fn(async () => undefined),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLICommandContext["runtime"],
    agent: {
      getMessages: vi.fn(async () => []),
      previewContext: vi.fn(async () => []),
      getToolList: vi.fn(async () => []),
    } as unknown as CLICommandContext["agent"],
    getState: () => current,
    updateState: (patch) => {
      current = { ...current, ...patch };
    },
    notice: vi.fn(),
  };
}

describe("registerBuiltinCommands", () => {
  it("registers Phase 1 commands", () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);

    expect(registry.list().map((command) => command.name)).toEqual(expect.arrayContaining([
      "about",
      "help",
      "keybindings",
      "status",
      "config",
      "commands",
      "compact",
      "context",
      "history",
      "input-history",
      "references",
      "search",
      "snapshots",
      "tools",
      "models",
      "new",
      "clear",
      "sessions",
      "agent",
      "auto",
      "details",
      "thinking",
      "doctor",
      "panel-close",
      "quit",
    ]));
  });

  it("opens help panel", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/help");

    expect(commandCtx.getState().panel).toEqual({ type: "help" });
  });

  it("opens filtered help when /help receives a query", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/help diff");

    expect(commandCtx.getState().panel).toEqual({ type: "help", query: "diff" });
  });

  it("opens filtered help from /commands aliases", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/cmds staged");

    expect(commandCtx.getState().panel).toEqual({ type: "help", query: "staged" });
  });

  it("opens status panel", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/status");

    expect(commandCtx.getState().panel).toEqual({ type: "status" });
  });

  it("opens about panel from version alias", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.updateState({
      baseDir: "C:/repo/project",
      modelPaths: ["openai/fast", "anthropic/sonnet"],
      commandHelp: [
        {
          name: "help",
          aliases: ["h"],
          description: "Show help",
          usage: "/help [query]",
          source: "builtin",
        },
        {
          name: "review",
          aliases: [],
          description: "Review changes",
          usage: "/review [args]",
          source: "custom",
        },
      ],
      sessions: [
        {
          id: "s1",
          name: "default",
          createdAt: "2026-07-02T00:00:00.000Z",
          updatedAt: "2026-07-02T00:00:00.000Z",
          messageCount: 0,
        },
      ],
    });

    await registry.execute(commandCtx, "/version");

    expect(commandCtx.getState().panel).toEqual({
      type: "about",
      info: expect.objectContaining({
        packageVersion: expect.any(String),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        baseDir: "C:/repo/project",
        modelCount: 2,
        sessionCount: 1,
        builtinCommandCount: 1,
        customCommandCount: 1,
        projectConfigPath: expect.stringContaining(".cliagent"),
        globalConfigPath: expect.any(String),
      }),
    });
  });

  it("opens keybindings panel from alias", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/keys");

    expect(commandCtx.getState().panel).toEqual({ type: "keybindings" });
  });

  it("opens references panel", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.updateState({
      referencePaths: ["README.md", "src/cli/index.tsx"],
    });

    await registry.execute(commandCtx, "/references");

    expect(commandCtx.getState().panel).toEqual({
      type: "references",
      references: ["README.md", "src/cli/index.tsx"],
    });
  });

  it("opens input history panel with newest prompts first", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.updateState({
      inputHistory: ["plan the change", "write tests", "fix lint"],
    });

    await registry.execute(commandCtx, "/input-history");

    expect(commandCtx.getState().panel).toEqual({
      type: "input-history",
      entries: [
        { index: 3, text: "fix lint" },
        { index: 2, text: "write tests" },
        { index: 1, text: "plan the change" },
      ],
    });
  });

  it("filters input history from aliases", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.updateState({
      inputHistory: ["plan the change", "write tests", "fix lint"],
    });

    await registry.execute(commandCtx, "/prompts TEST");

    expect(commandCtx.getState().panel).toEqual({
      type: "input-history",
      query: "TEST",
      entries: [
        { index: 2, text: "write tests" },
      ],
    });
  });

  it("opens transcript search panel from alias", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    const messages: Message[] = [
      { id: "u1", type: MessageType.User, content: "What is the weather?" },
      { id: "a1", type: MessageType.Assist, content: "It is sunny." },
      { id: "u2", type: MessageType.User, content: "Search WEATHER again." },
    ];
    commandCtx.agent.getMessages = vi.fn(async () => messages);

    await registry.execute(commandCtx, "/find weather");

    expect(commandCtx.getState().panel).toEqual({
      type: "search",
      query: "weather",
      hits: [
        {
          id: "u1",
          index: 1,
          role: "user",
          preview: "What is the weather?",
        },
        {
          id: "u2",
          index: 3,
          role: "user",
          preview: "Search WEATHER again.",
        },
      ],
    });
  });

  it("shows an error panel for empty transcript search", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/search");

    expect(commandCtx.getState().panel).toEqual({
      type: "error",
      message: "Usage: /search <query>",
    });
  });

  it("opens redacted config panel", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.updateState({
      config: CLIConfigSchema.parse({
        providers: [{
          engine: "openai",
          key: "sk-secret",
          models: [{ id: "fast", name: "gpt-4o-mini" }],
        }],
        defaultModel: "openai/fast",
      }),
    });

    await registry.execute(commandCtx, "/config");

    expect(commandCtx.getState().panel).toEqual({
      type: "config",
      title: "Config",
      content: expect.stringContaining("\"key\": \"<redacted>\""),
    });
    expect(commandCtx.getState().panel).not.toEqual({
      type: "config",
      title: "Config",
      content: expect.stringContaining("sk-secret"),
    });
  });

  it("opens config paths panel", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/config paths");

    expect(commandCtx.getState().panel).toEqual({
      type: "config",
      title: "Config Paths",
      content: expect.stringContaining("Project config:"),
    });
    expect(commandCtx.getState().panel).toEqual({
      type: "config",
      title: "Config Paths",
      content: expect.stringContaining("Global config:"),
    });
  });

  it("shows an error panel for malformed config commands", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/config reload");

    expect(commandCtx.getState().panel).toEqual({
      type: "error",
      message: "Usage: /config [paths]",
    });
  });

  it("opens a filtered tools panel", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    const tools = [
      {
        name: "read",
        description: "Read files",
        parameters: {} as never,
        execute: vi.fn(async () => ""),
      },
      {
        name: "shell",
        description: "Run shell commands",
        parameters: {} as never,
        execute: vi.fn(async () => ""),
      },
      {
        name: "write",
        description: "Write files",
        parameters: {} as never,
        execute: vi.fn(async () => ""),
      },
    ];
    commandCtx.agent.getToolList = vi.fn(async () => tools);

    await registry.execute(commandCtx, "/tools shell");

    expect(commandCtx.getState().panel).toEqual({
      type: "tools",
      query: "shell",
      tools: [tools[1]],
    });
  });

  it("filters tools by resolved permission decision", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    const tools = [
      {
        name: "read",
        description: "Read files",
        parameters: {} as never,
        execute: vi.fn(async () => ""),
      },
      {
        name: "write",
        description: "Write files",
        parameters: {} as never,
        execute: vi.fn(async () => ""),
      },
    ];
    commandCtx.agent.getToolList = vi.fn(async () => tools);
    commandCtx.updateState({
      config: CLIConfigSchema.parse({
        permission: {
          "*": "ask",
          read: "allow",
        },
      }),
    });

    await registry.execute(commandCtx, "/tools allow");

    expect(commandCtx.getState().panel).toEqual({
      type: "tools",
      query: "allow",
      tools: [tools[0]],
    });
  });

  it("requests quit through the runtime without exiting directly", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.requestExit = vi.fn(async () => undefined);
    const exit = vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`unexpected process.exit(${String(code)})`);
    }) as never);

    try {
      await registry.execute(commandCtx, "/quit");
      expect(commandCtx.runtime.requestExit).toHaveBeenCalledOnce();
      expect(commandCtx.runtime.destroy).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    } finally {
      exit.mockRestore();
    }
  });

  it("selects a model when /model receives a selector", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.selectModel = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/model openai/fast");

    expect(commandCtx.runtime.selectModel).toHaveBeenCalledWith("openai/fast");
  });

  it("switches agent mode through the runtime", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/agent plan");

    expect(commandCtx.getState().mode).toBe("plan");
    expect(commandCtx.runtime.setAgentMode).toHaveBeenCalledWith("plan");
  });

  it("opens the agent list when /agent has no mode", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.showAgents = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/agent");

    expect(commandCtx.runtime.showAgents).toHaveBeenCalled();
  });

  it("dispatches session subcommands to runtime methods", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.createSession = vi.fn(async () => undefined);
    commandCtx.runtime.switchSession = vi.fn(async () => undefined);
    commandCtx.runtime.renameSession = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/new feature work");
    await registry.execute(commandCtx, "/sessions switch s2");
    await registry.execute(commandCtx, "/sessions rename s2 renamed session");

    expect(commandCtx.runtime.createSession).toHaveBeenCalledWith("feature work");
    expect(commandCtx.runtime.switchSession).toHaveBeenCalledWith("s2");
    expect(commandCtx.runtime.renameSession).toHaveBeenCalledWith("s2", "renamed session");
  });

  it("dispatches export and import commands to runtime methods", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.exportSession = vi.fn(async () => "out.json");
    commandCtx.runtime.importSession = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/export json exports/session.json");
    await registry.execute(commandCtx, "/import exports/session.json imported session");

    expect(commandCtx.runtime.exportSession).toHaveBeenCalledWith("json", "exports/session.json");
    expect(commandCtx.runtime.importSession).toHaveBeenCalledWith("exports/session.json", "imported session");
  });

  it("dispatches undo and redo commands to runtime methods", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.clearSession = vi.fn(async () => undefined);
    commandCtx.runtime.undo = vi.fn(async () => undefined);
    commandCtx.runtime.redo = vi.fn(async () => undefined);
    commandCtx.runtime.compactContext = vi.fn(async () => undefined);
    commandCtx.runtime.showGitStatus = vi.fn(async () => undefined);
    commandCtx.runtime.showGitLog = vi.fn(async () => undefined);
    commandCtx.runtime.showDiff = vi.fn(async () => undefined);
    commandCtx.runtime.showSnapshots = vi.fn(async () => undefined);
    commandCtx.runtime.runDiagnostics = vi.fn(async () => undefined);
    commandCtx.runtime.runDoctor = vi.fn(async () => undefined);
    commandCtx.runtime.showActivity = vi.fn(async () => undefined);
    commandCtx.runtime.initializeProjectInstructions = vi.fn(async () => ({
      written: true,
      path: "AGENTS.md",
    }));
    commandCtx.runtime.setPermissionRule = vi.fn(async () => undefined);
    commandCtx.runtime.unsetPermissionRule = vi.fn(async () => undefined);
    commandCtx.runtime.setSystemPrompt = vi.fn(async () => undefined);
    commandCtx.runtime.unsetSystemPrompt = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/init");
    await registry.execute(commandCtx, "/init --force");
    await registry.execute(commandCtx, "/permissions");
    expect(commandCtx.getState().panel).toEqual({
      type: "permissions",
      permission: commandCtx.getState().config.permission,
      autoApprove: false,
    });
    await registry.execute(commandCtx, "/permissions set shell:npm * allow");
    await registry.execute(commandCtx, "/permissions unset write");

    await registry.execute(commandCtx, "/system");
    await registry.execute(commandCtx, "/system set Custom coding prompt");
    await registry.execute(commandCtx, "/system unset");
    await registry.execute(commandCtx, "/clear");
    await registry.execute(commandCtx, "/undo");
    await registry.execute(commandCtx, "/redo");
    await registry.execute(commandCtx, "/compact");
    await registry.execute(commandCtx, "/git status");
    await registry.execute(commandCtx, "/git log 3");
    await registry.execute(commandCtx, "/diff src/cli");
    await registry.execute(commandCtx, "/diff --staged src/cli");
    await registry.execute(commandCtx, "/snapshots");
    await registry.execute(commandCtx, "/diagnostics");
    await registry.execute(commandCtx, "/doctor");
    await registry.execute(commandCtx, "/activity");

    expect(commandCtx.runtime.clearSession).toHaveBeenCalled();
    expect(commandCtx.runtime.undo).toHaveBeenCalled();
    expect(commandCtx.runtime.redo).toHaveBeenCalled();
    expect(commandCtx.runtime.compactContext).toHaveBeenCalled();
    expect(commandCtx.runtime.showGitStatus).toHaveBeenCalled();
    expect(commandCtx.runtime.showGitLog).toHaveBeenCalledWith(3);
    expect(commandCtx.runtime.showDiff).toHaveBeenCalledWith("src/cli");
    expect(commandCtx.runtime.showDiff).toHaveBeenCalledWith("src/cli", { staged: true });
    expect(commandCtx.runtime.showSnapshots).toHaveBeenCalled();
    expect(commandCtx.runtime.runDiagnostics).toHaveBeenCalled();
    expect(commandCtx.runtime.runDoctor).toHaveBeenCalled();
    expect(commandCtx.runtime.showActivity).toHaveBeenCalled();
    expect(commandCtx.runtime.initializeProjectInstructions).toHaveBeenNthCalledWith(1, false);
    expect(commandCtx.runtime.initializeProjectInstructions).toHaveBeenNthCalledWith(2, true);
    expect(commandCtx.runtime.setPermissionRule).toHaveBeenCalledWith("shell:npm *", "allow");
    expect(commandCtx.runtime.unsetPermissionRule).toHaveBeenCalledWith("write");
    expect(commandCtx.runtime.setSystemPrompt).toHaveBeenCalledWith("Custom coding prompt");
    expect(commandCtx.runtime.unsetSystemPrompt).toHaveBeenCalled();
    expect(commandCtx.getState().panel).toEqual({
      type: "system",
      basePrompt: "You are a helpful assistant.",
      effectivePrompt: expect.stringContaining("Agent mode: build"),
    });
  });

  it("shows an error panel for malformed permissions commands", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.setPermissionRule = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/permissions set write maybe");

    expect(commandCtx.runtime.setPermissionRule).not.toHaveBeenCalled();
    expect(commandCtx.getState().panel).toEqual({
      type: "error",
      message: "Usage: /permissions set <target> <allow|ask|deny>",
    });
  });

  it("shows an error panel for malformed system commands", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.setSystemPrompt = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/system set");

    expect(commandCtx.runtime.setSystemPrompt).not.toHaveBeenCalled();
    expect(commandCtx.getState().panel).toEqual({
      type: "error",
      message: "Usage: /system set <prompt>",
    });
  });

  it("rejects malformed interactive git log limits", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.showGitLog = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/git log 3abc");

    expect(commandCtx.runtime.showGitLog).not.toHaveBeenCalled();
    expect(commandCtx.getState().panel).toEqual({
      type: "error",
      message: "Usage: /git log [limit]",
    });

    await registry.execute(commandCtx, "/git log 0");

    expect(commandCtx.runtime.showGitLog).not.toHaveBeenCalled();
    expect(commandCtx.getState().panel).toEqual({
      type: "error",
      message: "Usage: /git log [limit]",
    });
  });

  it("submits edited content from the external editor command", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.openEditor = vi.fn(async () => "edited prompt");
    commandCtx.runtime.submitInput = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/editor initial prompt");

    expect(commandCtx.runtime.openEditor).toHaveBeenCalledWith("initial prompt");
    expect(commandCtx.runtime.submitInput).toHaveBeenCalledWith("edited prompt");
  });

  it("does not submit empty edited content", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    commandCtx.runtime.openEditor = vi.fn(async () => " \n");
    commandCtx.runtime.submitInput = vi.fn(async () => undefined);

    await registry.execute(commandCtx, "/editor");

    expect(commandCtx.runtime.submitInput).not.toHaveBeenCalled();
    expect(commandCtx.notice).toHaveBeenCalledWith("info", "Editor returned empty content");
  });

  it("opens sessions panel with session metadata", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    const sessions = [{
      id: "s1",
      name: "default",
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
      messageCount: 0,
    }];
    commandCtx.updateState({ sessions });

    await registry.execute(commandCtx, "/sessions");

    expect(commandCtx.getState().panel).toEqual({ type: "sessions", sessions });
  });

  it("filters sessions by name or id", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();
    const sessions = [
      {
        id: "alpha-session",
        name: "default",
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
        messageCount: 0,
      },
      {
        id: "beta-session",
        name: "Refactor CLI",
        createdAt: "2026-07-02T00:00:01.000Z",
        updatedAt: "2026-07-02T00:00:01.000Z",
        messageCount: 3,
      },
    ];
    commandCtx.updateState({ sessions });

    await registry.execute(commandCtx, "/sessions search cli");

    expect(commandCtx.getState().panel).toEqual({
      type: "sessions",
      query: "cli",
      sessions: [sessions[1]!],
    });
  });
});

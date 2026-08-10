import { describe, expect, it } from "vitest";
import { AgentUseFactoryResultSchema } from "./assembly/manager.js";
import { CLIConfigSchema, LoadConfigOptionsSchema } from "./config.js";
import { CLIEntryActionSchema } from "./entry-args.js";
import { ActivityViewPropsSchema } from "./components/ActivityView.js";
import { EditorServiceSchema } from "./runtime/editor-service.js";
import { ShellServiceSchema } from "./runtime/shell-service.js";
import { CLIAppRuntimeSchema, CLICommandSchema, CLIStateSchema } from "./runtime/types.js";

describe("schema-first exported runtime schemas", () => {
  it("rejects an unsupported completion shell", () => {
    expect(CLIEntryActionSchema.safeParse({
      type: "completion",
      shell: "tcsh",
    }).success).toBe(false);
  });

  it("rejects a non-AgentUse factory result", () => {
    expect(AgentUseFactoryResultSchema.safeParse(42).success).toBe(false);
  });

  it("validates nested CLI state mode through its canonical schema", () => {
    const result = CLIStateSchema.safeParse({
      baseDir: "/workspace",
      config: CLIConfigSchema.parse({}),
      mode: "bogus",
      modelName: "model",
      modelPaths: [],
      commandSuggestions: [],
      commandHelp: [],
      referencePaths: [],
      inputHistory: [],
      sessionId: "session",
      sessionName: "Session",
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
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ["mode"] }));
    }
  });

  it("rejects values outside the Node platform union", () => {
    expect(LoadConfigOptionsSchema.safeParse({ platform: 42 }).success).toBe(false);
    expect(LoadConfigOptionsSchema.safeParse({ platform: "plan9" }).success).toBe(false);
    expect(LoadConfigOptionsSchema.safeParse({ platform: "linux" }).success).toBe(true);
  });

  it.each([
    ["CLI app runtime", CLIAppRuntimeSchema],
    ["CLI command", CLICommandSchema],
    ["editor service", EditorServiceSchema],
    ["shell service", ShellServiceSchema],
  ])("rejects invalid %s protocol candidates", (_name, schema) => {
    for (const candidate of [42, null, {}]) {
      expect(schema.safeParse(candidate).success).toBe(false);
    }
  });

  it("preserves valid CLI service identity", () => {
    const editor = { openEditor: async (content: string): Promise<string> => content };
    const shell = {
      execute: async () => ({
        stdout: "",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        aborted: false,
      }),
    };

    expect(EditorServiceSchema.parse(editor)).toBe(editor);
    expect(ShellServiceSchema.parse(shell)).toBe(shell);
  });

  it("validates component Props as data", () => {
    expect(ActivityViewPropsSchema.safeParse(42).success).toBe(false);
    expect(ActivityViewPropsSchema.safeParse({ entries: [] }).success).toBe(false);
    expect(ActivityViewPropsSchema.safeParse({
      entries: [],
      onClose: (): void => {},
    }).success).toBe(true);
  });
});

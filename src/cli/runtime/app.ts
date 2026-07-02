import { MessageType, type Message } from "../../core/types.js";
import { registerBuiltinCommands } from "../commands/builtin.js";
import { loadConfig } from "../config.js";
import { completeActivityEntry, createActivityEntry } from "./activity.js";
import {
  createCLIAgentFactory,
  formatResolvedModelPath,
  getResolvedModelPaths,
  selectResolvedModelForCLI,
} from "./agent-factory.js";
import { createCommandRegistry } from "./command-registry.js";
import { createDiagnosticsService } from "./diagnostics-service.js";
import { createEditorService } from "./editor-service.js";
import { loadCustomCommands } from "./custom-command-service.js";
import { createExportService } from "./export-service.js";
import { createGitService } from "./git-service.js";
import { createInputRouter } from "./input-router.js";
import { createPermissionService } from "./permission-service.js";
import { createReferenceService } from "./reference-service.js";
import { createShellService } from "./shell-service.js";
import { createCLISessionService } from "./session-service.js";
import { createSnapshotService } from "./snapshot-service.js";
import type { CLIAppRuntime, CLICommandContext, CLIEvent, CLIRuntimeSubscriber, CLIState } from "./types.js";

function formatCurrentModel(agent: { getCurrentResolvedModel(): ReturnType<CLICommandContext["agent"]["getCurrentResolvedModel"]> }): string {
  const current = agent.getCurrentResolvedModel();
  return current ? formatResolvedModelPath(current) : "(none)";
}

interface RedoEntry {
  sessionId: string;
  turnId: string;
  messages: Message[];
}

export async function createCLIRuntime(baseDir: string): Promise<CLIAppRuntime> {
  const config = await loadConfig(baseDir);
  const sessionService = await createCLISessionService(baseDir);
  const session = await sessionService.ensureActiveSession();
  const exportService = createExportService({ baseDir, sessionService });
  const editorService = createEditorService({ config: config.editor });

  const subscribers = new Set<CLIRuntimeSubscriber>();
  const approvalResolvers = new Map<string, (decision: boolean) => void>();
  const redoStack: RedoEntry[] = [];
  const permissionService = createPermissionService(config.permission);
  const shellService = createShellService(config.shell);
  const diagnosticsService = createDiagnosticsService({
    baseDir,
    config: config.diagnostics,
    shellService,
  });
  const gitService = createGitService(baseDir);
  let activeTurnId: string | null = null;
  const snapshotService = createSnapshotService({
    baseDir,
    sessionService,
    getActiveSessionId: () => state.sessionId,
    getActiveTurnId: () => activeTurnId,
  });
  let state: CLIState;

  const factory = await createCLIAgentFactory({
    baseDir,
    mode: config.defaultAgent,
    permissionService,
    getAutoApprove: () => state.autoApprove,
    requestApproval: (toolName, args) => new Promise((resolve) => {
      const id = crypto.randomUUID();
      approvalResolvers.set(id, resolve);
      updateState({ approval: { id, toolName, args, decision: "pending" } });
    }),
    shellService,
    snapshotService,
  });
  let built = await factory.build(session.id);

  state = {
    baseDir,
    config,
    mode: config.defaultAgent,
    modelName: formatCurrentModel(built.agent),
    modelPaths: getResolvedModelPaths(built.agent),
    sessionId: session.id,
    sessionName: session.name,
    sessions: sessionService.listSessions(),
    autoApprove: false,
    showReasoning: config.tui.showReasoning,
    showToolDetails: config.tui.showToolDetails,
    isRunning: false,
    currentTool: null,
    messages: await built.agent.getMessages(),
    streamingText: "",
    reasoningText: "",
    turnCount: 0,
    tokenUsage: { input: 0, output: 0, total: 0 },
    activity: [],
    panel: { type: "none" },
    approval: null,
    error: null,
  };

  const registry = createCommandRegistry();
  registerBuiltinCommands(registry);
  const registeredCommandNames = new Set(registry.list().flatMap((command) => [
    command.name,
    ...(command.aliases ?? []),
  ]));
  for (const command of await loadCustomCommands(baseDir)) {
    if (registeredCommandNames.has(command.name)) {
      emit({ type: "notice", level: "warn", message: `Custom command /${command.name} conflicts with a built-in command` });
      continue;
    }
    registry.register(command);
    registeredCommandNames.add(command.name);
    for (const alias of command.aliases ?? []) {
      registeredCommandNames.add(alias);
    }
  }
  const router = createInputRouter({
    commandRegistry: registry,
    shellService,
    referenceService: createReferenceService(baseDir),
    cwd: baseDir,
  });

  function emit(event: CLIEvent): void {
    for (const subscriber of subscribers) {
      subscriber(event);
    }
  }

  function updateState(patch: Partial<CLIState>): void {
    state = { ...state, ...patch };
    emit({ type: "state", state });
  }

  function createCommandContext(runtime: CLIAppRuntime): CLICommandContext {
    return {
      runtime,
      agent: built.agent,
      getState: () => state,
      updateState,
      notice: (level, message) => emit({ type: "notice", level, message }),
    };
  }

  function bindAgentEvents(): void {
    built.agent.on("run:start", () => updateState({ isRunning: true, error: null }));
    built.agent.on("run:complete", (payload) => updateState({
      isRunning: false,
      messages: payload.messages,
      streamingText: "",
      reasoningText: "",
    }));
    built.agent.on("run:error", (payload) => updateState({
      isRunning: false,
      error: payload.error instanceof Error ? payload.error.message : String(payload.error),
    }));
    built.agent.on("turn:start", (payload) => updateState({ turnCount: payload.turn }));
    built.agent.on("llm:chunk", (payload) => {
      if (payload.chunk.type === "text-delta") {
        updateState({ streamingText: state.streamingText + payload.chunk.text });
      }
      if (payload.chunk.type === "reasoning-delta") {
        updateState({ reasoningText: state.reasoningText + payload.chunk.text });
      }
    });
    built.agent.on("llm:response", (payload) => updateState({ tokenUsage: payload.response.tokenCount }));
    built.agent.on("tool:execute", (payload) => {
      updateState({
        currentTool: payload.toolCall.toolName,
        activity: [
          ...state.activity,
          createActivityEntry(payload.toolCall, new Date().toISOString()),
        ].slice(-100),
      });
      emit({ type: "tool:start", toolCall: payload.toolCall });
    });
    built.agent.on("tool:result", (payload) => {
      updateState({
        currentTool: null,
        activity: completeActivityEntry(
          state.activity,
          payload.toolCall,
          payload.result,
          new Date().toISOString(),
        ),
      });
      emit({ type: "tool:result", toolCall: payload.toolCall, result: payload.result });
    });
    built.agent.on("message:notify", (payload) => {
      updateState({ messages: [...state.messages, payload.message] });
    });
  }

  bindAgentEvents();

  async function replaceAgentForActiveSession(): Promise<void> {
    const previous = built.agent;
    const active = sessionService.getActiveSession();
    built = await factory.build(active.id);
    await previous.destroy();
    bindAgentEvents();
    updateState({
      sessionId: active.id,
      sessionName: active.name,
      sessions: sessionService.listSessions(),
      modelName: formatCurrentModel(built.agent),
      modelPaths: getResolvedModelPaths(built.agent),
      messages: await built.agent.getMessages(),
      panel: { type: "none" },
    });
  }

  function refreshSessionMetadata(): void {
    const active = sessionService.getActiveSession();
    updateState({
      sessionId: active.id,
      sessionName: active.name,
      sessions: sessionService.listSessions(),
    });
  }

  const runtime: CLIAppRuntime = {
    getState: () => state,
    subscribe: (listener) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    submitInput: async (input) => {
      const result = await router.route(createCommandContext(runtime), input);
      if (result.type === "prompt") {
        const message: Message = {
          id: crypto.randomUUID(),
          type: MessageType.User,
          content: result.content,
        };
        activeTurnId = message.id;
        try {
          await built.agent.run(message);
        } finally {
          activeTurnId = null;
        }
      }
      if (result.type === "shell") {
        const message: Message = {
          id: crypto.randomUUID(),
          type: MessageType.User,
          content: `Shell output:\n${result.content}`,
        };
        updateState({ messages: [...state.messages, message] });
      }
    },
    runCommand: async (name, args) => {
      await registry.execute(createCommandContext(runtime), `/${name} ${args}`.trim());
    },
    selectModel: async (path) => {
      selectResolvedModelForCLI(built.agent, path);
      updateState({ modelName: formatCurrentModel(built.agent) });
    },
    createSession: async (name) => {
      await sessionService.createSession(name);
      await replaceAgentForActiveSession();
    },
    switchSession: async (id) => {
      await sessionService.switchSession(id);
      await replaceAgentForActiveSession();
    },
    renameSession: async (id, name) => {
      await sessionService.renameSession(id, name);
      refreshSessionMetadata();
    },
    deleteSession: async (id) => {
      const previousActiveId = state.sessionId;
      await sessionService.deleteSession(id);
      if (previousActiveId === id) {
        await replaceAgentForActiveSession();
        return;
      }
      refreshSessionMetadata();
    },
    forkSession: async (id, name) => {
      await sessionService.forkSession(id, name);
      refreshSessionMetadata();
    },
    exportSession: async (format, outputPath) => {
      if (format === "json") {
        return exportService.exportJson(state.sessionId, outputPath);
      }
      return exportService.exportMarkdown(state.sessionId, outputPath);
    },
    importSession: async (inputPath, name) => {
      await exportService.importJson(inputPath, name);
      await replaceAgentForActiveSession();
    },
    undo: async () => {
      const removed = await sessionService.removeLastUserTurn(state.sessionId);
      try {
        await snapshotService.restoreTurn(removed.turnId);
      } catch (error: unknown) {
        await sessionService.appendMessages(state.sessionId, removed.messages);
        throw error;
      }
      redoStack.push({
        sessionId: state.sessionId,
        turnId: removed.turnId,
        messages: removed.messages,
      });
      await replaceAgentForActiveSession();
      emit({ type: "notice", level: "info", message: `Undid turn ${removed.turnId}` });
    },
    redo: async () => {
      const index = redoStack.findLastIndex((entry) => entry.sessionId === state.sessionId);
      if (index === -1) {
        throw new Error("No turn to redo");
      }
      const entry = redoStack.splice(index, 1)[0]!;
      await snapshotService.reapplyTurn(entry.turnId);
      await sessionService.appendMessages(state.sessionId, entry.messages);
      await replaceAgentForActiveSession();
      emit({ type: "notice", level: "info", message: `Redid turn ${entry.turnId}` });
    },
    compactContext: async () => {
      const messages = await built.agent.getMessages();
      built.compressor.updateMessages(messages);
      await built.compressor.maybeCompress();
      emit({
        type: "notice",
        level: "info",
        message: `Compressed ${built.compressor.getCompressedCount()} messages`,
      });
    },
    showGitStatus: async () => {
      updateState({
        panel: {
          type: "git",
          title: "Git Status",
          content: await gitService.statusShort(),
        },
      });
    },
    showGitLog: async (limit) => {
      updateState({
        panel: {
          type: "git",
          title: "Git Log",
          content: await gitService.log(limit === undefined ? undefined : { limit }),
        },
      });
    },
    showDiff: async (path) => {
      updateState({
        panel: {
          type: "diff",
          title: "Git Diff",
          content: await gitService.diff(path === undefined ? undefined : { path }),
        },
      });
    },
    openEditor: async (initialContent) => editorService.openEditor(initialContent),
    runDiagnostics: async () => {
      updateState({
        panel: {
          type: "diagnostics",
          results: await diagnosticsService.runDiagnostics(),
        },
      });
    },
    showActivity: async () => {
      updateState({ panel: { type: "activity", entries: state.activity } });
    },
    answerApproval: (id, decision) => {
      approvalResolvers.get(id)?.(decision);
      approvalResolvers.delete(id);
      updateState({ approval: null });
    },
    stop: () => {
      built.agent.stop();
    },
    rebuildAgent: async (_reason) => {
      const previous = built.agent;
      built = await factory.build(state.sessionId);
      await previous.destroy();
      bindAgentEvents();
      updateState({
        modelName: formatCurrentModel(built.agent),
        modelPaths: getResolvedModelPaths(built.agent),
        messages: await built.agent.getMessages(),
        sessions: sessionService.listSessions(),
      });
    },
    destroy: async () => {
      for (const resolve of approvalResolvers.values()) {
        resolve(false);
      }
      approvalResolvers.clear();
      await built.agent.destroy();
    },
  };

  return runtime;
}

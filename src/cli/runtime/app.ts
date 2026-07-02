import {
  MessageType,
  type Message,
  type MessageContent,
  type ToolCallMessage,
  type ToolResultMessage,
} from "../../core/types.js";
import type { ResolvedModel } from "../../core/config.js";
import { type SessionMeta } from "../../core/session.js";
import { registerBuiltinCommands } from "../commands/builtin.js";
import { loadConfig, type CLIConfig, type CLIPermissionDecision } from "../config.js";
import {
  completeActivityEntry,
  completeApprovalActivityEntry,
  createActivityEntry,
  createApprovalActivityEntry,
} from "./activity.js";
import {
  createCLIAgentFactory,
  formatResolvedModelPath,
  getResolvedModelPaths,
  selectResolvedModelForCLI,
} from "./agent-factory.js";
import {
  addCommandRegistrationNames,
  findCommandNamespaceConflict,
  getCommandRegistrationNames,
} from "./command-namespace.js";
import { createCommandRegistry } from "./command-registry.js";
import { createDiagnosticsService } from "./diagnostics-service.js";
import { createDoctorService } from "./doctor-service.js";
import { createEditorService } from "./editor-service.js";
import { loadCustomCommands } from "./custom-command-service.js";
import { createExportService } from "./export-service.js";
import { createGitService } from "./git-service.js";
import { createInputRouter } from "./input-router.js";
import { createInputHistoryService } from "./input-history-service.js";
import {
  createModeAwarePermissionService,
  createPermissionService,
  createSessionPermissionService,
} from "./permission-service.js";
import { createPermissionConfigService } from "./permission-config-service.js";
import { createProjectInstructionsService } from "./project-instructions-service.js";
import { createReferenceService } from "./reference-service.js";
import { createReferenceTurnContextAppender } from "./reference-turn-context.js";
import { createShellService } from "./shell-service.js";
import { createCLISessionService } from "./session-service.js";
import { createSnapshotService } from "./snapshot-service.js";
import { createSubagentService } from "./subagent-service.js";
import { createSystemPromptConfigService } from "./system-prompt-config-service.js";
import type {
  CLIAppRuntime,
  CLIApprovalAnswer,
  CLIApprovalDecision,
  CLICommand,
  CLICommandContext,
  CLICommandHelpItem,
  CLICommandHelpSource,
  CLIEvent,
  CLIInputOverrides,
  CLISessionSearchHit,
  CLIRuntimeSubscriber,
  CLIState,
} from "./types.js";

function messageContentText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (content.type === "text") return content.text;
  return "[image]";
}

function transcriptSearchText(message: Message): string {
  if (message.type === MessageType.ToolCall) {
    return `${message.toolName} ${JSON.stringify(message.arguments)}`;
  }
  return messageContentText(message.content);
}

function transcriptSearchRole(
  message: Message,
): CLISessionSearchHit["role"] {
  switch (message.type) {
    case MessageType.System:
      return "system";
    case MessageType.User:
      return "user";
    case MessageType.Assist:
      return "assistant";
    case MessageType.ToolCall:
      return "tool-call";
    case MessageType.ToolResult:
      return "tool-result";
  }
}

function transcriptSearchPreview(text: string, query: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const index = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
  }

  const start = Math.max(0, index - 40);
  const end = Math.min(normalized.length, index + query.length + 80);
  const preview = normalized.slice(start, end);
  return `${start > 0 ? "..." : ""}${preview}${end < normalized.length ? "..." : ""}`;
}

function formatCurrentModel(agent: { getCurrentResolvedModel(): ReturnType<CLICommandContext["agent"]["getCurrentResolvedModel"]> }): string {
  const current = agent.getCurrentResolvedModel();
  return current ? formatResolvedModelPath(current) : "(none)";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getCommandSuggestions(commands: CLICommand[]): string[] {
  return commands
    .filter((command) => command.hidden !== true)
    .flatMap((command) => [
      `/${command.name}`,
      ...(command.aliases ?? []).map((alias) => `/${alias}`),
    ]);
}

function getCommandHelpItems(
  commands: CLICommand[],
  source: CLICommandHelpSource,
): CLICommandHelpItem[] {
  return commands
    .filter((command) => command.hidden !== true)
    .map((command) => ({
      name: command.name,
      aliases: command.aliases ?? [],
      description: command.description,
      usage: command.usage,
      source,
    }));
}

interface RedoEntry {
  sessionId: string;
  turnId: string;
  messages: Message[];
}

interface ApprovalResolver {
  toolName: string;
  args: Record<string, unknown>;
  resolve: (approved: boolean) => void;
}

const EMPTY_TOKEN_USAGE = { input: 0, output: 0, total: 0 } as const;

function normalizeApprovalAnswer(answer: CLIApprovalAnswer): CLIApprovalDecision {
  if (answer === true) return "allow";
  if (answer === false) return "deny";
  return answer;
}

function approvalAnswerAllows(answer: CLIApprovalAnswer): boolean {
  const decision = normalizeApprovalAnswer(answer);
  return decision === "allow" || decision === "allow-session";
}

function sessionPermissionDecision(answer: CLIApprovalAnswer): "allow" | "deny" | null {
  const decision = normalizeApprovalAnswer(answer);
  if (decision === "allow-session") return "allow";
  if (decision === "deny-session") return "deny";
  return null;
}

export async function createCLIRuntime(baseDir: string): Promise<CLIAppRuntime> {
  let config = await loadConfig(baseDir);
  const sessionService = await createCLISessionService(baseDir);
  const session = await sessionService.ensureActiveSession();
  const sessionRuntimeMetadata = await sessionService.readSessionRuntimeMetadata(session.id);
  const exportService = createExportService({ baseDir, sessionService });
  const projectInstructionsService = createProjectInstructionsService(baseDir);
  const permissionConfigService = createPermissionConfigService(baseDir);
  const systemPromptConfigService = createSystemPromptConfigService(baseDir);
  const subagentService = createSubagentService(baseDir, () => config);
  const editorService = createEditorService({ config: config.editor });
  const inputHistoryService = createInputHistoryService(baseDir);

  const subscribers = new Set<CLIRuntimeSubscriber>();
  const approvalResolvers = new Map<string, ApprovalResolver>();
  const redoStack: RedoEntry[] = [];
  const permissionService = createSessionPermissionService(
    createPermissionService(config.permission),
  );
  const shellService = createShellService(config.shell);
  const diagnosticsService = createDiagnosticsService({
    baseDir,
    config: config.diagnostics,
    shellService,
  });
  const gitService = createGitService(baseDir);
  const doctorService = createDoctorService({ gitService, diagnosticsService });
  let activeTurnId: string | null = null;
  let activeMode = sessionRuntimeMetadata.mode ?? config.defaultAgent;
  const referenceService = createReferenceService(baseDir);
  const referenceTurnContextAppender = createReferenceTurnContextAppender();
  const snapshotService = createSnapshotService({
    baseDir,
    sessionService,
    getActiveSessionId: () => state.sessionId,
    getActiveTurnId: () => activeTurnId,
  });
  let state: CLIState;

  async function refreshReferencePaths(): Promise<void> {
    updateState({ referencePaths: await referenceService.listReferenceCandidates() });
  }

  function requestApproval(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    return new Promise((resolve) => {
      const id = crypto.randomUUID();
      approvalResolvers.set(id, { toolName, args, resolve });
      updateState({
        approval: { id, toolName, args, decision: "pending" },
        activity: [
          ...state.activity,
          createApprovalActivityEntry(id, toolName, args, new Date().toISOString()),
        ].slice(-100),
      });
    });
  }

  const factory = await createCLIAgentFactory({
    baseDir,
    mode: () => activeMode,
    getConfig: () => config,
    getActiveSessionId: () => state.sessionId,
    permissionService,
    getAutoApprove: () => state.autoApprove,
    requestApproval,
    shellService,
    snapshotService,
    onWorkspaceFilesChanged: refreshReferencePaths,
  });
  let built = await factory.build(session.id);
  built.agent.register(referenceTurnContextAppender);

  function applySessionModelPreference(meta: SessionMeta): void {
    if (meta.model === undefined) {
      return;
    }
    selectResolvedModelForCLI(built.agent, meta.model);
  }

  applySessionModelPreference(session);

  state = {
    baseDir,
    config,
    mode: activeMode,
    modelName: formatCurrentModel(built.agent),
    modelPaths: getResolvedModelPaths(built.agent),
    commandSuggestions: [],
    commandHelp: [],
    referencePaths: await referenceService.listReferenceCandidates(),
    inputHistory: await inputHistoryService.list(),
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
    tokenUsage: sessionRuntimeMetadata.tokenUsage,
    activity: [],
    panel: { type: "none" },
    approval: null,
    error: null,
    exitRequested: false,
  };

  const registry = createCommandRegistry();
  registerBuiltinCommands(registry);
  const builtinCommands = registry.list();
  const registeredCommandNames = new Set(builtinCommands.flatMap(getCommandRegistrationNames));
  const customCommands: CLICommand[] = [];
  for (const command of await loadCustomCommands(baseDir)) {
    const conflict = findCommandNamespaceConflict(command, registeredCommandNames);
    if (conflict !== undefined) {
      emit({
        type: "notice",
        level: "warn",
        message: `Custom command /${command.name} conflicts with existing command or alias /${conflict}`,
      });
      continue;
    }
    registry.register(command);
    customCommands.push(command);
    addCommandRegistrationNames(registeredCommandNames, command);
  }
  updateState({
    commandSuggestions: getCommandSuggestions(registry.list()),
    commandHelp: [
      ...getCommandHelpItems(builtinCommands, "builtin"),
      ...getCommandHelpItems(customCommands, "custom"),
    ],
  });
  const routerPermissionService = createModeAwarePermissionService({
    base: permissionService,
    getMode: () => state.mode,
  });
  const router = createInputRouter({
    commandRegistry: registry,
    permissionService: routerPermissionService,
    getAutoApprove: () => state.autoApprove,
    requestApproval,
    shellService,
    referenceService,
    cwd: baseDir,
  });

  function emit(event: CLIEvent): void {
    for (const subscriber of subscribers) {
      subscriber(event);
    }
  }

  function updateState(patch: Partial<CLIState>): void {
    if (patch.mode !== undefined) {
      activeMode = patch.mode;
    }
    state = { ...state, ...patch };
    emit({ type: "state", state });
  }

  function applyConfig(nextConfig: CLIConfig): void {
    config = nextConfig;
    permissionService.updateConfig(nextConfig.permission);
    updateState({ config: nextConfig });
  }

  async function updatePermissionRule(
    update: () => Promise<CLIConfig>,
  ): Promise<void> {
    applyConfig(await update());
    if (state.panel.type === "permissions") {
      updateState({
        panel: {
          type: "permissions",
          permission: state.config.permission,
          autoApprove: state.autoApprove,
        },
      });
    }
  }

  async function rebuildCurrentAgent(): Promise<void> {
    const previous = built.agent;
    const active = sessionService.getActiveSession();
    built = await factory.build(state.sessionId);
    built.agent.register(referenceTurnContextAppender);
    applySessionModelPreference(active);
    await previous.destroy();
    bindAgentEvents();
    updateState({
      modelName: formatCurrentModel(built.agent),
      modelPaths: getResolvedModelPaths(built.agent),
      messages: await built.agent.getMessages(),
      sessions: sessionService.listSessions(),
    });
  }

  function selectCurrentAgentModel(path: string): string {
    const selected = selectResolvedModelForCLI(built.agent, path);
    const modelName = formatResolvedModelPath(selected);
    updateState({ modelName });
    return modelName;
  }

  function restoreCurrentAgentModel(
    previousModel: ResolvedModel | undefined,
    previousModelName: string,
  ): void {
    if (previousModel === undefined) {
      updateState({ modelName: previousModelName });
      return;
    }
    selectCurrentAgentModel(formatResolvedModelPath(previousModel));
  }

  async function applyInputOverrides(overrides: CLIInputOverrides): Promise<void> {
    if (overrides.mode !== undefined && overrides.mode !== state.mode) {
      updateState({ mode: overrides.mode });
      await rebuildCurrentAgent();
    }
    if (overrides.model !== undefined) {
      selectCurrentAgentModel(overrides.model);
    }
  }

  async function restoreInputOverrides(
    previousMode: CLIState["mode"],
    previousModel: ResolvedModel | undefined,
    previousModelName: string,
  ): Promise<void> {
    if (state.mode !== previousMode) {
      updateState({ mode: previousMode });
      await rebuildCurrentAgent();
    }
    if (formatCurrentModel(built.agent) !== previousModelName) {
      restoreCurrentAgentModel(previousModel, previousModelName);
    }
  }

  async function updateSystemPrompt(update: () => Promise<CLIConfig>): Promise<void> {
    applyConfig(await update());
    await rebuildCurrentAgent();
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
    built.agent.on("llm:response", (payload) => {
      const tokenUsage = payload.response.tokenCount;
      updateState({ tokenUsage });
      void sessionService.updateSessionTokenUsage(state.sessionId, tokenUsage)
        .then(() => updateState({ sessions: sessionService.listSessions() }))
        .catch((error: unknown) => {
          updateState({ panel: { type: "error", message: errorMessage(error) } });
        });
    });
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
    const runtimeMetadata = await sessionService.readSessionRuntimeMetadata(active.id);
    activeMode = runtimeMetadata.mode ?? config.defaultAgent;
    built = await factory.build(active.id);
    built.agent.register(referenceTurnContextAppender);
    applySessionModelPreference(active);
    await previous.destroy();
    bindAgentEvents();
    updateState({
      sessionId: active.id,
      sessionName: active.name,
      sessions: sessionService.listSessions(),
      mode: activeMode,
      modelName: formatCurrentModel(built.agent),
      modelPaths: getResolvedModelPaths(built.agent),
      messages: await built.agent.getMessages(),
      tokenUsage: runtimeMetadata.tokenUsage,
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
      try {
        const result = await router.route(createCommandContext(runtime), input);
        if (result.type === "prompt") {
          const message: Message = {
            id: crypto.randomUUID(),
            type: MessageType.User,
            content: result.content,
          };
          activeTurnId = message.id;
          referenceTurnContextAppender.setReferences(result.references);
          try {
            await built.agent.run(message);
          } finally {
            activeTurnId = null;
            referenceTurnContextAppender.clear();
          }
        }
        if (result.type === "shell") {
          const shellInput = input.trim();
          const command = shellInput.startsWith("!") ? shellInput.slice(1).trim() : shellInput;
          const toolCallId = crypto.randomUUID();
          const userMessage: Message = {
            id: crypto.randomUUID(),
            type: MessageType.User,
            content: shellInput,
          };
          const toolCall: ToolCallMessage = {
            id: crypto.randomUUID(),
            type: MessageType.ToolCall,
            content: "",
            toolCallId,
            toolName: "shell",
            arguments: { command },
          };
          const toolResult: ToolResultMessage = {
            id: crypto.randomUUID(),
            type: MessageType.ToolResult,
            content: result.content,
            toolCallId,
          };
          const messages: Message[] = [userMessage, toolCall, toolResult];
          updateState({
            currentTool: "shell",
            activity: [
              ...state.activity,
              createActivityEntry(toolCall, new Date().toISOString()),
            ].slice(-100),
          });
          emit({ type: "tool:start", toolCall });
          await sessionService.appendMessages(state.sessionId, messages);
          updateState({
            currentTool: null,
            messages: [...state.messages, ...messages],
            sessions: sessionService.listSessions(),
            activity: completeActivityEntry(
              state.activity,
              toolCall,
              toolResult,
              new Date().toISOString(),
            ),
          });
          emit({ type: "tool:result", toolCall, result: toolResult });
        }
      } catch (error: unknown) {
        updateState({ panel: { type: "error", message: errorMessage(error) } });
      }
    },
    submitInputWithOverrides: async (input, overrides) => {
      const previousMode = state.mode;
      const previousModel = built.agent.getCurrentResolvedModel();
      const previousModelName = formatCurrentModel(built.agent);
      try {
        await applyInputOverrides(overrides);
        await runtime.submitInput(input);
      } finally {
        await restoreInputOverrides(previousMode, previousModel, previousModelName);
      }
    },
    runCommand: async (name, args) => {
      await registry.execute(createCommandContext(runtime), `/${name} ${args}`.trim());
    },
    selectModel: async (path) => {
      const modelName = selectCurrentAgentModel(path);
      await sessionService.updateSessionModel(state.sessionId, modelName);
      updateState({
        modelName,
        sessions: sessionService.listSessions(),
      });
    },
    setAgentMode: async (mode) => {
      await sessionService.updateSessionMode(state.sessionId, mode);
      updateState({
        mode,
        sessions: sessionService.listSessions(),
      });
      await rebuildCurrentAgent();
    },
    rememberInputHistory: async (input) => {
      updateState({ inputHistory: await inputHistoryService.append(input) });
    },
    createSession: async (name) => {
      await sessionService.createSession(name);
      await replaceAgentForActiveSession();
    },
    switchSession: async (id) => {
      await sessionService.switchSession(id);
      await replaceAgentForActiveSession();
    },
    clearSession: async () => {
      const sessionId = state.sessionId;
      await sessionService.writeMessages(sessionId, []);
      await sessionService.updateSessionTokenUsage(sessionId, EMPTY_TOKEN_USAGE);
      built.todoManager.clearTodos();
      for (let index = redoStack.length - 1; index >= 0; index--) {
        if (redoStack[index]!.sessionId === sessionId) {
          redoStack.splice(index, 1);
        }
      }
      await replaceAgentForActiveSession();
      emit({ type: "notice", level: "info", message: "Cleared current session" });
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
    showDiff: async (path, options = {}) => {
      updateState({
        panel: {
          type: "diff",
          title: options.staged === true ? "Git Diff (staged)" : "Git Diff",
          content: await gitService.diff({
            ...(path !== undefined && { path }),
            ...(options.staged !== undefined && { staged: options.staged }),
          }),
        },
      });
    },
    showSnapshots: async () => {
      updateState({
        panel: {
          type: "snapshots",
          records: await snapshotService.listSnapshots(),
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
    runDoctor: async () => {
      updateState({
        panel: {
          type: "doctor",
          checks: await doctorService.run(state),
        },
      });
    },
    listTools: async () => await built.agent.getToolList(),
    listTodos: () => built.todoManager.listTodos(),
    searchSessions: async (query) => {
      const normalizedQuery = query.toLowerCase();
      const hits: CLISessionSearchHit[] = [];
      for (const sessionMeta of sessionService.listSessions()) {
        const messages = await sessionService.readMessages(sessionMeta.id);
        messages.forEach((message, index) => {
          const text = transcriptSearchText(message);
          if (!text.toLowerCase().includes(normalizedQuery)) {
            return;
          }
          hits.push({
            sessionId: sessionMeta.id,
            sessionName: sessionMeta.name,
            id: message.id,
            index: index + 1,
            role: transcriptSearchRole(message),
            preview: transcriptSearchPreview(text, query),
          });
        });
      }
      return hits;
    },
    showActivity: async () => {
      updateState({ panel: { type: "activity", entries: state.activity } });
    },
    showAgents: async () => {
      updateState({
        panel: {
          type: "agents",
          mode: state.mode,
          subagents: await subagentService.listSubagents(),
        },
      });
    },
    initializeProjectInstructions: async (overwrite) => {
      const result = await projectInstructionsService.initialize({ overwrite });
      if (result.written) {
        await refreshReferencePaths();
      }
      return result;
    },
    setPermissionRule: async (target: string, decision: CLIPermissionDecision) => {
      await updatePermissionRule(() =>
        permissionConfigService.setRule(target, decision, state.config.permission));
    },
    unsetPermissionRule: async (target: string) => {
      await updatePermissionRule(() => permissionConfigService.unsetRule(target));
    },
    setSystemPrompt: async (prompt: string) => {
      await updateSystemPrompt(() => systemPromptConfigService.setSystemPrompt(prompt));
    },
    unsetSystemPrompt: async () => {
      await updateSystemPrompt(() => systemPromptConfigService.unsetSystemPrompt());
    },
    answerApproval: (id, decision) => {
      const pending = approvalResolvers.get(id);
      const sessionDecision = sessionPermissionDecision(decision);
      if (pending !== undefined) {
        if (sessionDecision !== null) {
          permissionService.rememberSessionDecision({
            toolName: pending.toolName,
            args: pending.args,
          }, sessionDecision);
        }
        pending.resolve(approvalAnswerAllows(decision));
      }
      approvalResolvers.delete(id);
      updateState({
        approval: null,
        activity: completeApprovalActivityEntry(
          state.activity,
          id,
          decision,
          new Date().toISOString(),
        ),
      });
    },
    stop: () => {
      built.agent.stop();
    },
    requestExit: async () => {
      if (state.exitRequested) {
        return;
      }
      updateState({ exitRequested: true });
    },
    rebuildAgent: async (_reason) => {
      await rebuildCurrentAgent();
    },
    destroy: async () => {
      for (const pending of approvalResolvers.values()) {
        pending.resolve(false);
      }
      approvalResolvers.clear();
      await built.agent.destroy();
    },
  };

  return runtime;
}

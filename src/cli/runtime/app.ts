import { join } from "node:path";
import { SessionManager } from "../../core/session.js";
import { MessageType, type Message } from "../../core/types.js";
import { registerBuiltinCommands } from "../commands/builtin.js";
import { CLIAGENT_DIR, loadConfig } from "../config.js";
import {
  createCLIAgentFactory,
  formatResolvedModelPath,
  getResolvedModelPaths,
  selectResolvedModelForCLI,
} from "./agent-factory.js";
import { createCommandRegistry } from "./command-registry.js";
import { createInputRouter } from "./input-router.js";
import { createPermissionService } from "./permission-service.js";
import { createReferenceService } from "./reference-service.js";
import { createShellService } from "./shell-service.js";
import type { CLIAppRuntime, CLICommandContext, CLIEvent, CLIRuntimeSubscriber, CLIState } from "./types.js";

function formatCurrentModel(agent: { getCurrentResolvedModel(): ReturnType<CLICommandContext["agent"]["getCurrentResolvedModel"]> }): string {
  const current = agent.getCurrentResolvedModel();
  return current ? formatResolvedModelPath(current) : "(none)";
}

export async function createCLIRuntime(baseDir: string): Promise<CLIAppRuntime> {
  const config = await loadConfig(baseDir);
  const sessionManager = new SessionManager(join(baseDir, CLIAGENT_DIR));
  await sessionManager.load();
  const existingSessions = sessionManager.list();
  const session = existingSessions[0] ?? await sessionManager.create("default");
  sessionManager.setActive(session.id);

  const subscribers = new Set<CLIRuntimeSubscriber>();
  const approvalResolvers = new Map<string, (decision: boolean) => void>();
  const permissionService = createPermissionService(config.permission);
  const shellService = createShellService(config.shell);
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
    panel: { type: "none" },
    approval: null,
    error: null,
  };

  const registry = createCommandRegistry();
  registerBuiltinCommands(registry);
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
      updateState({ currentTool: payload.toolCall.toolName });
      emit({ type: "tool:start", toolCall: payload.toolCall });
    });
    built.agent.on("tool:result", (payload) => {
      updateState({ currentTool: null });
      emit({ type: "tool:result", toolCall: payload.toolCall, result: payload.result });
    });
    built.agent.on("message:notify", (payload) => {
      updateState({ messages: [...state.messages, payload.message] });
    });
  }

  bindAgentEvents();

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
        await built.agent.run(message);
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

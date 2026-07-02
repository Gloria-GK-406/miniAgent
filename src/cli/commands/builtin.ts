import type { CommandRegistry } from "../runtime/command-registry.js";
import type { CLICommandContext, CLIInputHistoryPanelEntry } from "../runtime/types.js";
import type { CLIPermissionConfig, CLIPermissionDecision } from "../config.js";
import type { SessionMeta } from "../../core/session.js";
import { MessageType, type Message, type MessageContent, type ToolCallMessage } from "../../core/types.js";
import type { Tool } from "../../tool/types.js";
import type { TodoItemSnapshot } from "../../tool/todo.js";
import { formatConfigForDisplay } from "../config-display.js";
import { formatConfigPaths, resolveConfigPaths } from "../config-paths-runner.js";
import { readPackageVersion } from "../package-info.js";
import {
  buildEffectiveSystemPrompt,
  getBaseSystemPrompt,
} from "../runtime/system-prompt.js";
import { createModeAwarePermissionService, createPermissionService } from "../runtime/permission-service.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function splitArgs(args: string): string[] {
  return args.trim().length === 0 ? [] : args.trim().split(/\s+/);
}

function filterSessions(sessions: SessionMeta[], query: string): SessionMeta[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return sessions;
  }
  return sessions.filter((session) =>
    session.name.toLowerCase().includes(normalized) ||
    session.id.toLowerCase().includes(normalized));
}

function resolveSessionSelector(sessions: SessionMeta[], selector: string): string {
  const trimmed = selector.trim();
  if (trimmed.length === 0) {
    throw new Error("Session selector cannot be empty");
  }

  const exactId = sessions.find((session) => session.id === trimmed);
  if (exactId !== undefined) {
    return exactId.id;
  }

  const idMatches = sessions.filter((session) => session.id.startsWith(trimmed));
  if (idMatches.length === 1) {
    return idMatches[0]!.id;
  }
  if (idMatches.length > 1) {
    throw new Error(`Session selector is ambiguous: ${trimmed}`);
  }

  const normalized = trimmed.toLowerCase();
  const nameMatches = sessions.filter((session) => session.name.toLowerCase() === normalized);
  if (nameMatches.length === 1) {
    return nameMatches[0]!.id;
  }
  if (nameMatches.length > 1) {
    throw new Error(`Session selector is ambiguous: ${trimmed}`);
  }

  throw new Error(`Session not found: ${trimmed}`);
}

function messageContentText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (content.type === "text") return content.text;
  return "[image]";
}

function transcriptSearchText(message: Message): string {
  if (message.type === MessageType.ToolCall) {
    const toolCall = message as ToolCallMessage;
    return `${toolCall.toolName} ${JSON.stringify(toolCall.arguments)}`;
  }
  return messageContentText(message.content);
}

function transcriptSearchRole(
  message: Message,
): "system" | "user" | "assistant" | "tool-call" | "tool-result" {
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

function searchTranscript(messages: Message[], query: string) {
  const normalizedQuery = query.toLowerCase();
  return messages.flatMap((message, index) => {
    const text = transcriptSearchText(message);
    if (!text.toLowerCase().includes(normalizedQuery)) {
      return [];
    }
    return [{
      id: message.id,
      index: index + 1,
      role: transcriptSearchRole(message),
      preview: transcriptSearchPreview(text, query),
    }];
  });
}

function buildInputHistoryEntries(
  inputHistory: string[],
  query?: string,
): CLIInputHistoryPanelEntry[] {
  const normalizedQuery = query?.toLowerCase();
  return inputHistory
    .map((text, index) => ({ index: index + 1, text }))
    .filter((entry) => normalizedQuery === undefined || entry.text.toLowerCase().includes(normalizedQuery))
    .reverse();
}

function showInputHistoryPanel(ctx: CLICommandContext, args: string): void {
  const query = args.trim();
  const entries = buildInputHistoryEntries(
    ctx.getState().inputHistory,
    query.length === 0 ? undefined : query,
  );
  ctx.updateState({
    panel: query.length === 0
      ? { type: "input-history", entries }
      : { type: "input-history", query, entries },
  });
}

function filterTools(ctx: CLICommandContext, tools: Tool[], query: string): Tool[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return tools;
  }
  const state = ctx.getState();
  const permission = state.config.permission ?? ({ "*": "ask" } satisfies CLIPermissionConfig);
  const permissionService = createModeAwarePermissionService({
    base: createPermissionService(permission),
    getMode: () => state.mode,
  });
  return tools.filter((tool) =>
    tool.name.toLowerCase().includes(normalized) ||
    tool.description.toLowerCase().includes(normalized) ||
    permissionService.resolve({
      toolName: tool.name,
      args: {},
    }, state.autoApprove).decision.includes(normalized));
}

function filterTodos(todos: TodoItemSnapshot[], query: string): TodoItemSnapshot[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return todos;
  }
  return todos.filter((todo) =>
    todo.id.toLowerCase().includes(normalized) ||
    todo.content.toLowerCase().includes(normalized) ||
    todo.status.toLowerCase().includes(normalized));
}

function parsePermissionDecision(value: string | undefined): CLIPermissionDecision | null {
  if (value === "allow" || value === "ask" || value === "deny") {
    return value;
  }
  return null;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed.toString() !== value) {
    return undefined;
  }
  return parsed;
}

function showHelpPanel(ctx: CLICommandContext, args: string): void {
  const query = args.trim();
  ctx.updateState({
    panel: query.length === 0
      ? { type: "help" }
      : { type: "help", query },
  });
}

function showAboutPanel(ctx: CLICommandContext): void {
  const state = ctx.getState();
  const paths = resolveConfigPaths(state.baseDir);
  ctx.updateState({
    panel: {
      type: "about",
      info: {
        packageVersion: readPackageVersion(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        baseDir: state.baseDir,
        projectConfigPath: paths.projectConfigPath,
        globalConfigPath: paths.globalConfigPath,
        modelCount: state.modelPaths.length,
        sessionCount: state.sessions.length,
        builtinCommandCount: state.commandHelp.filter((command) => command.source === "builtin").length,
        customCommandCount: state.commandHelp.filter((command) => command.source === "custom").length,
      },
    },
  });
}

function showPermissionsPanel(ctx: CLICommandContext): void {
  const state = ctx.getState();
  ctx.updateState({
    panel: {
      type: "permissions",
      permission: state.config.permission,
      autoApprove: state.autoApprove,
    },
  });
}

function showSystemPanel(ctx: CLICommandContext): void {
  const state = ctx.getState();
  const basePrompt = getBaseSystemPrompt(state.config);
  ctx.updateState({
    panel: {
      type: "system",
      basePrompt,
      effectivePrompt: buildEffectiveSystemPrompt({
        baseDir: state.baseDir,
        mode: state.mode,
        userSystemPrompt: basePrompt,
      }),
    },
  });
}

async function runSessionMutation(
  ctx: CLICommandContext,
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error: unknown) {
    ctx.updateState({ panel: { type: "error", message: errorMessage(error) } });
  }
}

export function registerBuiltinCommands(registry: CommandRegistry): void {
  registry.register({
    name: "about",
    aliases: ["version", "info"],
    description: "Show CLI version and runtime info",
    usage: "/about",
    execute: async (ctx) => {
      showAboutPanel(ctx);
    },
  });
  registry.register({
    name: "overview",
    aliases: ["dashboard", "home"],
    description: "Show workspace, session, git, todo, and activity summary",
    usage: "/overview",
    execute: async (ctx) => {
      await ctx.runtime.showOverview();
    },
  });
  registry.register({
    name: "help",
    aliases: ["h"],
    description: "Show help",
    usage: "/help [query]",
    execute: async (ctx, args) => {
      showHelpPanel(ctx, args);
    },
  });
  registry.register({
    name: "commands",
    aliases: ["cmds"],
    description: "Show slash commands",
    usage: "/commands [query]",
    execute: async (ctx, args) => {
      showHelpPanel(ctx, args);
    },
  });
  registry.register({
    name: "keybindings",
    aliases: ["keys", "shortcuts"],
    description: "Show keyboard shortcuts",
    usage: "/keybindings",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "keybindings" } });
    },
  });
  registry.register({
    name: "status",
    aliases: ["st"],
    description: "Show runtime status",
    usage: "/status",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "status" } });
    },
  });
  registry.register({
    name: "config",
    description: "Show effective config",
    usage: "/config [paths]",
    execute: async (ctx, args) => {
      const action = args.trim();
      if (action.length === 0) {
        ctx.updateState({
          panel: {
            type: "config",
            title: "Config",
            content: formatConfigForDisplay(ctx.getState().config),
          },
        });
        return;
      }

      if (action === "paths") {
        ctx.updateState({
          panel: {
            type: "config",
            title: "Config Paths",
            content: formatConfigPaths(resolveConfigPaths(ctx.getState().baseDir)),
          },
        });
        return;
      }

      ctx.updateState({ panel: { type: "error", message: "Usage: /config [paths]" } });
    },
  });
  registry.register({
    name: "init",
    description: "Create project AGENTS.md guidance",
    usage: "/init [--force]",
    execute: async (ctx, args) => {
      await runSessionMutation(ctx, async () => {
        const parts = splitArgs(args);
        const overwrite = parts.includes("--force");
        const unknown = parts.find((part) => part !== "--force");
        if (unknown !== undefined) {
          throw new Error("Usage: /init [--force]");
        }
        const result = await ctx.runtime.initializeProjectInstructions(overwrite);
        ctx.notice(
          "info",
          result.written
            ? `Wrote project instructions to ${result.path}`
            : `Project instructions already exist at ${result.path}`,
        );
      });
    },
  });
  registry.register({
    name: "history",
    description: "Show message history",
    usage: "/history",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "history", messages: await ctx.agent.getMessages() } });
    },
  });
  registry.register({
    name: "input-history",
    aliases: ["inputs", "prompts"],
    description: "Show submitted prompt history",
    usage: "/input-history [query]",
    execute: async (ctx, args) => {
      showInputHistoryPanel(ctx, args);
    },
  });
  registry.register({
    name: "context",
    description: "Preview context",
    usage: "/context",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "context", messages: await ctx.agent.previewContext() } });
    },
  });
  registry.register({
    name: "search",
    aliases: ["find"],
    description: "Search current transcript",
    usage: "/search <query>",
    execute: async (ctx, args) => {
      const query = args.trim();
      if (query.length === 0) {
        ctx.updateState({ panel: { type: "error", message: "Usage: /search <query>" } });
        return;
      }
      ctx.updateState({
        panel: {
          type: "search",
          query,
          hits: searchTranscript(await ctx.agent.getMessages(), query),
        },
      });
    },
  });
  registry.register({
    name: "search-all",
    aliases: ["history-search", "grep-sessions"],
    description: "Search all session transcripts",
    usage: "/search-all <query>",
    execute: async (ctx, args) => {
      const query = args.trim();
      if (query.length === 0) {
        ctx.updateState({ panel: { type: "error", message: "Usage: /search-all <query>" } });
        return;
      }
      ctx.updateState({
        panel: {
          type: "search-all",
          query,
          hits: await ctx.runtime.searchSessions(query),
        },
      });
    },
  });
  registry.register({
    name: "todos",
    aliases: ["todo", "tasks"],
    description: "Show agent todo list",
    usage: "/todos [query]",
    execute: async (ctx, args) => {
      const query = args.trim();
      const todos = filterTodos(ctx.runtime.listTodos(), query);
      ctx.updateState({
        panel: query.length === 0
          ? { type: "todos", todos }
          : { type: "todos", query, todos },
      });
    },
  });
  registry.register({
    name: "references",
    aliases: ["refs"],
    description: "List file reference candidates",
    usage: "/references",
    execute: async (ctx) => {
      ctx.updateState({
        panel: {
          type: "references",
          references: ctx.getState().referencePaths,
        },
      });
    },
  });
  registry.register({
    name: "tools",
    description: "List tools",
    usage: "/tools [query]",
    execute: async (ctx, args) => {
      const query = args.trim();
      const tools = filterTools(ctx, await ctx.agent.getToolList(), query);
      ctx.updateState({
        panel: query.length === 0
          ? { type: "tools", tools }
          : { type: "tools", query, tools },
      });
    },
  });
  registry.register({
    name: "permissions",
    aliases: ["permission"],
    description: "Show or edit permission policy",
    usage: "/permissions [set <target> <allow|ask|deny>|unset <target>]",
    execute: async (ctx, args) => {
      const parts = splitArgs(args);
      const action = parts[0];
      if (action === undefined) {
        showPermissionsPanel(ctx);
        return;
      }

      await runSessionMutation(ctx, async () => {
        switch (action) {
          case "set": {
            const raw = args.trim().slice(action.length).trim();
            const rawParts = splitArgs(raw);
            const decisionText = rawParts.at(-1);
            const decision = parsePermissionDecision(decisionText);
            if (decision === null || decisionText === undefined) {
              throw new Error("Usage: /permissions set <target> <allow|ask|deny>");
            }
            const target = raw.slice(0, raw.length - decisionText.length).trim();
            if (target.length === 0) {
              throw new Error("Usage: /permissions set <target> <allow|ask|deny>");
            }
            await ctx.runtime.setPermissionRule(target, decision);
            showPermissionsPanel(ctx);
            ctx.notice("info", `Set permission ${target} to ${decision}`);
            break;
          }
          case "unset": {
            const target = args.trim().slice(action.length).trim();
            if (target.length === 0) {
              throw new Error("Usage: /permissions unset <target>");
            }
            await ctx.runtime.unsetPermissionRule(target);
            showPermissionsPanel(ctx);
            ctx.notice("info", `Unset permission ${target}`);
            break;
          }
          default:
            throw new Error(`Unknown permissions action: ${action}`);
        }
      });
    },
  });
  registry.register({
    name: "system",
    description: "Show or edit the current system prompt",
    usage: "/system [set <prompt>|unset]",
    execute: async (ctx, args) => {
      const parts = splitArgs(args);
      const action = parts[0];
      if (action === undefined) {
        showSystemPanel(ctx);
        return;
      }

      await runSessionMutation(ctx, async () => {
        switch (action) {
          case "set": {
            const prompt = args.trim().slice(action.length).trim();
            if (prompt.length === 0) {
              throw new Error("Usage: /system set <prompt>");
            }
            await ctx.runtime.setSystemPrompt(prompt);
            showSystemPanel(ctx);
            ctx.notice("info", "Updated system prompt");
            break;
          }
          case "unset": {
            await ctx.runtime.unsetSystemPrompt();
            showSystemPanel(ctx);
            ctx.notice("info", "Unset system prompt");
            break;
          }
          default:
            throw new Error(`Unknown system action: ${action}`);
        }
      });
    },
  });
  registry.register({
    name: "models",
    aliases: ["model"],
    description: "Show model selector or select a model",
    usage: "/models [selector]",
    execute: async (ctx, args) => {
      const selector = args.trim();
      if (selector.length === 0) {
        ctx.updateState({ panel: { type: "models" } });
        return;
      }
      await runSessionMutation(ctx, async () => {
        await ctx.runtime.selectModel(selector);
        ctx.notice("info", `Selected model ${ctx.getState().modelName}`);
      });
    },
  });
  registry.register({
    name: "sessions",
    aliases: ["session"],
    description: "Show or manage sessions",
    usage: "/sessions [search|new|switch|fork|rename|delete]",
    execute: async (ctx, args) => {
      const parts = splitArgs(args);
      const action = parts[0];
      if (action === undefined) {
        ctx.updateState({ panel: { type: "sessions", sessions: ctx.getState().sessions } });
        return;
      }

      await runSessionMutation(ctx, async () => {
        switch (action) {
          case "search": {
            const query = args.trim().slice(action.length).trim();
            if (query.length === 0) {
              throw new Error("Usage: /sessions search <query>");
            }
            ctx.updateState({
              panel: {
                type: "sessions",
                sessions: filterSessions(ctx.getState().sessions, query),
                query,
              },
            });
            break;
          }
          case "new": {
            const name = args.trim().slice(action.length).trim();
            await ctx.runtime.createSession(name.length === 0 ? undefined : name);
            break;
          }
          case "switch": {
            const selector = parts[1];
            if (selector === undefined) throw new Error("Usage: /sessions switch <selector>");
            await ctx.runtime.switchSession(resolveSessionSelector(ctx.getState().sessions, selector));
            break;
          }
          case "fork": {
            const selector = parts[1];
            if (selector === undefined) throw new Error("Usage: /sessions fork <selector> [name]");
            const name = args.trim().slice(`${action} ${selector}`.length).trim();
            await ctx.runtime.forkSession(
              resolveSessionSelector(ctx.getState().sessions, selector),
              name.length === 0 ? undefined : name,
            );
            break;
          }
          case "rename": {
            const selector = parts[1];
            if (selector === undefined) throw new Error("Usage: /sessions rename <selector> <name>");
            const name = args.trim().slice(`${action} ${selector}`.length).trim();
            await ctx.runtime.renameSession(
              resolveSessionSelector(ctx.getState().sessions, selector),
              name,
            );
            break;
          }
          case "delete": {
            const selector = parts[1];
            if (selector === undefined) throw new Error("Usage: /sessions delete <selector>");
            await ctx.runtime.deleteSession(resolveSessionSelector(ctx.getState().sessions, selector));
            break;
          }
          default:
            throw new Error(`Unknown sessions action: ${action}`);
        }
      });
    },
  });
  registry.register({
    name: "new",
    description: "Create a new session",
    usage: "/new [name]",
    execute: async (ctx, args) => {
      const name = args.trim();
      await runSessionMutation(ctx, async () => {
        await ctx.runtime.createSession(name.length === 0 ? undefined : name);
      });
    },
  });
  registry.register({
    name: "clear",
    description: "Clear current session messages",
    usage: "/clear",
    execute: async (ctx) => {
      await runSessionMutation(ctx, async () => {
        await ctx.runtime.clearSession();
      });
    },
  });
  registry.register({
    name: "export",
    description: "Export current session",
    usage: "/export [json|markdown] [path]",
    execute: async (ctx, args) => {
      const parts = splitArgs(args);
      const format = parts[0] ?? "markdown";
      await runSessionMutation(ctx, async () => {
        if (format !== "json" && format !== "markdown") {
          throw new Error("Usage: /export [json|markdown] [path]");
        }
        const outputPath = args.trim().slice(format.length).trim();
        const written = await ctx.runtime.exportSession(
          format,
          outputPath.length === 0 ? undefined : outputPath,
        );
        ctx.notice("info", `Exported session to ${written}`);
      });
    },
  });
  registry.register({
    name: "import",
    description: "Import a JSON session export",
    usage: "/import <path> [name]",
    execute: async (ctx, args) => {
      const parts = splitArgs(args);
      await runSessionMutation(ctx, async () => {
        const inputPath = parts[0];
        if (inputPath === undefined) {
          throw new Error("Usage: /import <path> [name]");
        }
        const name = args.trim().slice(inputPath.length).trim();
        await ctx.runtime.importSession(inputPath, name.length === 0 ? undefined : name);
        ctx.notice("info", `Imported session from ${inputPath}`);
      });
    },
  });
  registry.register({
    name: "undo",
    description: "Undo the last user turn",
    usage: "/undo",
    execute: async (ctx) => {
      await runSessionMutation(ctx, async () => {
        await ctx.runtime.undo();
      });
    },
  });
  registry.register({
    name: "redo",
    description: "Redo the last undone turn",
    usage: "/redo",
    execute: async (ctx) => {
      await runSessionMutation(ctx, async () => {
        await ctx.runtime.redo();
      });
    },
  });
  registry.register({
    name: "compact",
    description: "Run context compression",
    usage: "/compact",
    execute: async (ctx) => {
      await runSessionMutation(ctx, async () => {
        await ctx.runtime.compactContext();
      });
    },
  });
  registry.register({
    name: "git",
    description: "Show git status or log",
    usage: "/git [status|log]",
    execute: async (ctx, args) => {
      const parts = splitArgs(args);
      const action = parts[0] ?? "status";
      await runSessionMutation(ctx, async () => {
        switch (action) {
          case "status":
            await ctx.runtime.showGitStatus();
            break;
          case "log": {
            const rawLimit = parts[1];
            const limit = parsePositiveInteger(rawLimit);
            if (rawLimit !== undefined && limit === undefined) {
              throw new Error("Usage: /git log [limit]");
            }
            await ctx.runtime.showGitLog(limit);
            break;
          }
          default:
            throw new Error(`Unknown git action: ${action}`);
        }
      });
    },
  });
  registry.register({
    name: "diff",
    description: "Show git diff",
    usage: "/diff [--staged] [path]",
    execute: async (ctx, args) => {
      await runSessionMutation(ctx, async () => {
        const parts = splitArgs(args);
        const staged = parts.includes("--staged");
        const unknown = parts.find((part) => part.startsWith("-") && part !== "--staged");
        if (unknown !== undefined) {
          throw new Error("Usage: /diff [--staged] [path]");
        }
        const path = parts.filter((part) => part !== "--staged").join(" ");
        const targetPath = path.length === 0 ? undefined : path;
        if (staged) {
          await ctx.runtime.showDiff(targetPath, { staged: true });
          return;
        }
        await ctx.runtime.showDiff(targetPath);
      });
    },
  });
  registry.register({
    name: "snapshots",
    description: "Show workspace file snapshots",
    usage: "/snapshots",
    execute: async (ctx) => {
      await runSessionMutation(ctx, async () => {
        await ctx.runtime.showSnapshots();
      });
    },
  });
  registry.register({
    name: "editor",
    aliases: ["edit"],
    description: "Compose input in an external editor",
    usage: "/editor [initial text]",
    execute: async (ctx, args) => {
      await runSessionMutation(ctx, async () => {
        const edited = await ctx.runtime.openEditor(args);
        const content = edited.trim();
        if (content.length === 0) {
          ctx.notice("info", "Editor returned empty content");
          return;
        }
        await ctx.runtime.submitInput(content);
      });
    },
  });
  registry.register({
    name: "diagnostics",
    description: "Run configured project diagnostics",
    usage: "/diagnostics",
    execute: async (ctx) => {
      await runSessionMutation(ctx, async () => {
        await ctx.runtime.runDiagnostics();
      });
    },
  });
  registry.register({
    name: "doctor",
    description: "Check CLI setup and project health",
    usage: "/doctor",
    execute: async (ctx) => {
      await runSessionMutation(ctx, async () => {
        await ctx.runtime.runDoctor();
      });
    },
  });
  registry.register({
    name: "activity",
    description: "Show recent tool and subagent activity",
    usage: "/activity",
    execute: async (ctx) => {
      await ctx.runtime.showActivity();
    },
  });
  registry.register({
    name: "agent",
    description: "Show agents or switch primary mode",
    usage: "/agent [list|build|plan]",
    execute: async (ctx, args) => {
      const mode = args.trim();
      if (mode.length === 0 || mode === "list") {
        await ctx.runtime.showAgents();
        return;
      }
      if (mode !== "build" && mode !== "plan") {
        ctx.notice("info", `Current agent: ${ctx.getState().mode}`);
        return;
      }
      await ctx.runtime.setAgentMode(mode);
    },
  });
  registry.register({
    name: "auto",
    description: "Toggle auto approval",
    usage: "/auto",
    execute: async (ctx) => {
      ctx.updateState({ autoApprove: !ctx.getState().autoApprove });
    },
  });
  registry.register({
    name: "details",
    description: "Toggle tool details",
    usage: "/details",
    execute: async (ctx) => {
      ctx.updateState({ showToolDetails: !ctx.getState().showToolDetails });
    },
  });
  registry.register({
    name: "thinking",
    description: "Toggle reasoning visibility",
    usage: "/thinking",
    execute: async (ctx) => {
      ctx.updateState({ showReasoning: !ctx.getState().showReasoning });
    },
  });
  registry.register({
    name: "panel-close",
    hidden: true,
    description: "Close panel",
    usage: "/panel-close",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "none" } });
    },
  });
  registry.register({
    name: "quit",
    aliases: ["exit", "q"],
    description: "Exit",
    usage: "/quit",
    execute: async (ctx) => {
      await ctx.runtime.requestExit();
    },
  });
}

import type { CommandRegistry } from "../runtime/command-registry.js";
import type { CLICommandContext } from "../runtime/types.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function splitArgs(args: string): string[] {
  return args.trim().length === 0 ? [] : args.trim().split(/\s+/);
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
    name: "help",
    aliases: ["h"],
    description: "Show help",
    usage: "/help",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "help" } });
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
    name: "context",
    description: "Preview context",
    usage: "/context",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "context", messages: await ctx.agent.previewContext() } });
    },
  });
  registry.register({
    name: "tools",
    description: "List tools",
    usage: "/tools",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "tools", tools: await ctx.agent.getToolList() } });
    },
  });
  registry.register({
    name: "models",
    aliases: ["model"],
    description: "Show model selector",
    usage: "/models",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "models" } });
    },
  });
  registry.register({
    name: "sessions",
    aliases: ["session"],
    description: "Show or manage sessions",
    usage: "/sessions [new|switch|fork|rename|delete]",
    execute: async (ctx, args) => {
      const parts = splitArgs(args);
      const action = parts[0];
      if (action === undefined) {
        ctx.updateState({ panel: { type: "sessions", sessions: ctx.getState().sessions } });
        return;
      }

      await runSessionMutation(ctx, async () => {
        switch (action) {
          case "new": {
            const name = args.trim().slice(action.length).trim();
            await ctx.runtime.createSession(name.length === 0 ? undefined : name);
            break;
          }
          case "switch": {
            const id = parts[1];
            if (id === undefined) throw new Error("Usage: /sessions switch <id>");
            await ctx.runtime.switchSession(id);
            break;
          }
          case "fork": {
            const id = parts[1];
            if (id === undefined) throw new Error("Usage: /sessions fork <id> [name]");
            const name = args.trim().slice(`${action} ${id}`.length).trim();
            await ctx.runtime.forkSession(id, name.length === 0 ? undefined : name);
            break;
          }
          case "rename": {
            const id = parts[1];
            if (id === undefined) throw new Error("Usage: /sessions rename <id> <name>");
            const name = args.trim().slice(`${action} ${id}`.length).trim();
            await ctx.runtime.renameSession(id, name);
            break;
          }
          case "delete": {
            const id = parts[1];
            if (id === undefined) throw new Error("Usage: /sessions delete <id>");
            await ctx.runtime.deleteSession(id);
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
    name: "agent",
    description: "Switch agent mode",
    usage: "/agent build|plan",
    execute: async (ctx, args) => {
      const mode = args.trim();
      if (mode !== "build" && mode !== "plan") {
        ctx.notice("info", `Current agent: ${ctx.getState().mode}`);
        return;
      }
      ctx.updateState({ mode });
      await ctx.runtime.rebuildAgent(`switch agent ${mode}`);
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
      await ctx.runtime.destroy();
      process.exit(0);
    },
  });
}

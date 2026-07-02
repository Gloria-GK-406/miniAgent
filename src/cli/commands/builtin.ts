import type { CommandRegistry } from "../runtime/command-registry.js";

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
    description: "Show sessions",
    usage: "/sessions",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "sessions" } });
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

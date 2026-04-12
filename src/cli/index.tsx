import { render } from "ink";
import { createCLIApp } from "./cli-app.js";
import { App } from "./components/App.js";

const A = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    red: "\x1b[31m",
    magenta: "\x1b[35m",
};

function printHelp(): void {
    const lines = [
        `${A.bold}Commands:${A.reset}`,
        `  ${A.cyan}/models${A.reset}                List configured models`,
        `  ${A.cyan}/model <provider/model>${A.reset} Switch active model`,
        `  ${A.cyan}/tools${A.reset}                 List registered tools`,
        `  ${A.cyan}/history${A.reset}               View conversation history`,
        `  ${A.cyan}/context${A.reset}               Preview context sent to LLM`,
        `  ${A.cyan}/compress${A.reset}              Manually trigger context compression`,
        `  ${A.cyan}/session${A.reset}               List all sessions`,
        `  ${A.cyan}/session new${A.reset}            Create a new session`,
        `  ${A.cyan}/session switch <id>${A.reset}    Switch to a session`,
        `  ${A.cyan}/session delete <id>${A.reset}    Delete a session`,
        `  ${A.cyan}/session rename <id> <name>${A.reset}  Rename a session`,
        `  ${A.cyan}/hitl [on|off]${A.reset}          Toggle human-in-the-loop`,
        `  ${A.cyan}/clear${A.reset}                 Clear current conversation`,
        `  ${A.cyan}/system <text>${A.reset}          Update system prompt`,
        `  ${A.cyan}/help${A.reset}                  Show this help`,
        `  ${A.cyan}/quit${A.reset}                  Exit`,
    ];
    console.log(lines.join("\n"));
}

async function main(): Promise<void> {
    process.stdout.write("\x1b[?1049h");
    process.stdout.write("\x1b[2J\x1b[H");

    const cleanup = (): void => {
        process.stdout.write("\x1b[?1049l");
    };
    process.on("exit", cleanup);

    try {
        const ctx = await createCLIApp(process.cwd());

        let currentAgent = ctx.agent;
        let currentHitl = ctx.hitlEnabled;
        let currentSession = ctx.session;
        let currentActiveModel = ctx.activeModel;
        let currentSystemPrompt = ctx.config.systemPrompt ?? "You are a helpful assistant.";

        const inkHolder: { current: ReturnType<typeof render> | undefined } = { current: undefined };

        function getModelName(): string {
            return `${currentActiveModel.provider}/${currentActiveModel.model}`;
        }

        async function handleSelectModelAsync(path: string): Promise<void> {
            currentAgent.setModelByPath(path);
            const current = currentAgent.getCurrentModel();
            const found = ctx.config.models.find(
                (m) => m.provider === current.provider && m.model === current.model,
            );
            if (found) {
                currentActiveModel = found;
            }
            rerenderApp();
        }

        function rerenderApp(): void {
            if (!inkHolder.current) return;
            inkHolder.current.rerender(
                <App
                    agent={currentAgent}
                    modelName={getModelName()}
                    modelPaths={currentAgent.getModelDisplayList()}
                    sessionName={currentSession.name}
                    hitlEnabled={currentHitl}
                    tokenUsage={{ input: 0, output: 0, total: 0 }}
                    onCommand={handleCommand}
                    onSelectModel={handleSelectModelAsync}
                />,
            );
        }

        async function handleCommandAsync(input: string): Promise<void> {
            const spaceIdx = input.indexOf(" ");
            const cmd = spaceIdx === -1 ? input : input.slice(0, spaceIdx);
            const arg = spaceIdx === -1 ? "" : input.slice(spaceIdx + 1).trim();

            switch (cmd) {
                case "/quit":
                case "/exit": {
                    process.exit(0);
                    break;
                }

                case "/help": {
                    printHelp();
                    break;
                }

                case "/models": {
                    const displayList = currentAgent.getModelDisplayList();
                    const current = currentAgent.getCurrentModel();
                    const currentPath = `${current.provider}/${current.model}`;
                    console.log(`${A.bold}Models:${A.reset}`);
                    for (const p of displayList) {
                        const marker = p === currentPath ? ` ${A.green}← active${A.reset}` : "";
                        console.log(`  ${A.cyan}${p}${A.reset}${marker}`);
                    }
                    break;
                }

                case "/model": {
                    if (!arg) {
                        const current = currentAgent.getCurrentModel();
                        console.log(
                            `Current: ${A.bold}${current.provider}/${current.model}${A.reset}`,
                        );
                        break;
                    }
                    try {
                        currentAgent.setModelByPath(arg);
                        const current = currentAgent.getCurrentModel();
                        const found = ctx.config.models.find(
                            (m) => m.provider === current.provider && m.model === current.model,
                        );
                        if (found) currentActiveModel = found;
                        console.log(
                            `Switched to ${A.bold}${current.provider}/${current.model}${A.reset}`,
                        );
                        rerenderApp();
                    } catch (e: unknown) {
                        console.log(`${A.red}${e instanceof Error ? e.message : String(e)}${A.reset}`);
                    }
                    break;
                }

                case "/tools": {
                    try {
                        const tools = await currentAgent.getToolList();
                        console.log(`${A.bold}Tools (${tools.length}):${A.reset}`);
                        for (const t of tools) {
                            console.log(`  ${A.cyan}${t.name}${A.reset} — ${t.description}`);
                        }
                    } catch {
                        console.log(`${A.red}Failed to list tools.${A.reset}`);
                    }
                    break;
                }

                case "/clear": {
                    const active = ctx.sessionManager.getActive();
                    if (active) {
                        currentAgent = await ctx.rebuildAgent(active.id);
                    }
                    console.log(`${A.green}Conversation cleared.${A.reset}`);
                    rerenderApp();
                    break;
                }

                case "/system": {
                    if (!arg) {
                        console.log(`System prompt: ${currentSystemPrompt}`);
                        break;
                    }
                    currentSystemPrompt = arg;
                    ctx.setSystemPrompt(arg);
                    console.log("System prompt updated.");
                    break;
                }

                case "/sessions":
                case "/session": {
                    if (!arg) {
                        const sessions = ctx.sessionManager.list();
                        const active = ctx.sessionManager.getActive();
                        if (sessions.length === 0) {
                            console.log(
                                `${A.yellow}No sessions. Use /session new to create one.${A.reset}`,
                            );
                            break;
                        }
                        console.log(`${A.bold}Sessions:${A.reset}`);
                        for (const s of sessions) {
                            const isActive = active !== undefined && s.id === active.id;
                            const marker = isActive ? ` ${A.green}← active${A.reset}` : "";
                            const date = new Date(s.updatedAt).toLocaleString();
                            console.log(
                                `  ${isActive ? A.green : A.cyan}${s.name}${A.reset} (${s.id.slice(0, 8)}) — ${s.messageCount} msgs, ${date}${marker}`,
                            );
                        }
                    } else if (arg === "new") {
                        const session = await ctx.sessionManager.create();
                        ctx.sessionManager.setActive(session.id);
                        currentAgent = await ctx.rebuildAgent(session.id);
                        currentSession = session;
                        console.log(
                            `${A.green}Created & switched to session: ${A.bold}${session.name}${A.reset} (${session.id.slice(0, 8)})`,
                        );
                        rerenderApp();
                    } else if (arg.startsWith("switch ")) {
                        const idPrefix = arg.slice(7).trim();
                        const sessions = ctx.sessionManager.list();
                        const match = sessions.find(
                            (s) => s.id.startsWith(idPrefix) || s.name === idPrefix,
                        );
                        if (!match) {
                            console.log(`${A.red}Session not found: ${idPrefix}${A.reset}`);
                            break;
                        }
                        ctx.sessionManager.setActive(match.id);
                        currentAgent = await ctx.rebuildAgent(match.id);
                        currentSession = match;
                        console.log(
                            `${A.green}Switched to session: ${A.bold}${match.name}${A.reset} (${match.messageCount} messages)`,
                        );
                        rerenderApp();
                    } else if (arg.startsWith("delete ")) {
                        const idPrefix = arg.slice(7).trim();
                        const sessions = ctx.sessionManager.list();
                        const match = sessions.find(
                            (s) => s.id.startsWith(idPrefix) || s.name === idPrefix,
                        );
                        if (!match) {
                            console.log(`${A.red}Session not found: ${idPrefix}${A.reset}`);
                            break;
                        }
                        if (sessions.length <= 1) {
                            console.log(`${A.red}Cannot delete the last session.${A.reset}`);
                            break;
                        }
                        const active = ctx.sessionManager.getActive();
                        const wasActive = active !== undefined && match.id === active.id;
                        await ctx.sessionManager.delete(match.id);
                        console.log(`${A.green}Deleted session: ${match.name}${A.reset}`);
                        if (wasActive) {
                            const remaining = ctx.sessionManager.list();
                            if (remaining.length > 0) {
                                const next = remaining[0]!;
                                ctx.sessionManager.setActive(next.id);
                                currentAgent = await ctx.rebuildAgent(next.id);
                                currentSession = next;
                                console.log(
                                    `${A.green}Switched to session: ${A.bold}${next.name}${A.reset}`,
                                );
                            }
                        }
                        rerenderApp();
                    } else if (arg.startsWith("rename ")) {
                        const parts = arg.slice(7).trim();
                        const sep = parts.indexOf(" ");
                        if (sep === -1) {
                            console.log(
                                `${A.red}Usage: /session rename <id_prefix> <new_name>${A.reset}`,
                            );
                            break;
                        }
                        const idPrefix = parts.slice(0, sep);
                        const newName = parts.slice(sep + 1);
                        const sessions = ctx.sessionManager.list();
                        const match = sessions.find(
                            (s) => s.id.startsWith(idPrefix) || s.name === idPrefix,
                        );
                        if (!match) {
                            console.log(`${A.red}Session not found: ${idPrefix}${A.reset}`);
                            break;
                        }
                        await ctx.sessionManager.updateMeta(match.id, { name: newName });
                        if (currentSession.id === match.id) {
                            currentSession = { ...currentSession, name: newName };
                        }
                        console.log(
                            `${A.green}Renamed session to: ${A.bold}${newName}${A.reset}`,
                        );
                        rerenderApp();
                    } else {
                        console.log(
                            `${A.red}Unknown session sub-command. Use: new, switch, delete, rename${A.reset}`,
                        );
                    }
                    break;
                }

                case "/hitl": {
                    if (arg === "on") {
                        currentHitl = true;
                        ctx.setHITL(true);
                        console.log(`${A.green}Human-in-the-loop enabled.${A.reset}`);
                    } else if (arg === "off") {
                        currentHitl = false;
                        ctx.setHITL(false);
                        console.log(`${A.yellow}Human-in-the-loop disabled.${A.reset}`);
                    } else {
                        console.log(
                            `HITL: ${currentHitl ? `${A.green}on${A.reset}` : `${A.yellow}off${A.reset}`}`,
                        );
                    }
                    rerenderApp();
                    break;
                }

                case "/compress": {
                    const msgs = await currentAgent.getMessages();
                    ctx.compressor.updateMessages(msgs);
                    await ctx.compressor.maybeCompress();
                    const count = ctx.compressor.getCompressedCount();
                    console.log(`${A.green}Compressed ${count} messages.${A.reset}`);
                    break;
                }

                default:
                    console.log(`${A.red}Unknown command: ${cmd}${A.reset}`);
                    printHelp();
            }
        }

        function handleCommand(input: string): void {
            handleCommandAsync(input).catch((e: unknown) => {
                console.log(`${A.red}${e instanceof Error ? e.message : String(e)}${A.reset}`);
            });
        }

        inkHolder.current = render(
            <App
                agent={currentAgent}
                modelName={getModelName()}
                modelPaths={currentAgent.getModelDisplayList()}
                sessionName={currentSession.name}
                hitlEnabled={currentHitl}
                tokenUsage={{ input: 0, output: 0, total: 0 }}
                onCommand={handleCommand}
                onSelectModel={handleSelectModelAsync}
            />,
            { exitOnCtrlC: false },
        );
    } catch (e: unknown) {
        process.stdout.write("\x1b[?1049l");
        process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
        process.exit(1);
    }
}

main();

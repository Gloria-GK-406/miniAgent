import { createInterface, type Interface } from "node:readline";
import { join } from "node:path";

import { AgentAssembler, AgentBlueprintRegistry } from "../core/assembler.js";
import type { AgentBlueprint } from "../core/blueprint.js";
import { defineAgentModule } from "../core/module.js";
import { LLMEngineManager } from "../core/llm.js";
import { MessageType, LLMStreamChunkType } from "../core/types.js";
import type {
    Message,
    LLMStreamChunk,
    ToolCallMessage,
    ToolResultMessage,
} from "../core/types.js";
import type { MiniAgent } from "../core/agent.js";
import type { AgentConfig, ModelGroup } from "../core/config.js";
import type { LLMEngineCtor } from "../core/llm.js";
import { SessionManager } from "../core/session.js";
import type { SessionMeta } from "../core/session.js";
import { ContextCompressor } from "../context/compressor.js";
import type { ApprovalDecision } from "../tool/approver.js";
import { AnthropicEngine } from "../engine/anthropic/index.js";
import { OpenAIEngine } from "../engine/openai/index.js";
import { OpenAICompatibleEngine } from "../engine/openai-compatible/index.js";
import { GLMEngine } from "../engine/glm/index.js";
import { GLMCodePlanEngine } from "../engine/glm-codeplan/index.js";
import {
    readTool, writeTool, editTool, globTool, grepTool, bashTool,
    TodoManager, SubAgentProvider, AgentContextProvider,
} from "../tool/index.js";
import { McpPlugin } from "../tool/mcp/plugin.js";
import { SkillPlugin } from "../tool/skill/plugin.js";
import type { AgentFactory } from "../tool/subagent.js";
import { CLIAGENT_DIR, loadConfig, findModel, toModelConfig } from "./config.js";
import type { CLIConfig, CLIModel } from "./config.js";
import type { JsonValue } from "../core/config.js";

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

const ENGINES: Record<string, LLMEngineCtor> = {
    anthropic: AnthropicEngine,
    openai: OpenAIEngine,
    "openai-compatible": OpenAICompatibleEngine,
    glm: GLMEngine,
    "glm-codeplan": GLMCodePlanEngine,
};

const AUTO_APPROVE_TOOLS = ["read", "glob", "grep"];
const SHARED_BLUEPRINT: AgentBlueprint = {
    uses: [
        "tool.read",
        "tool.write",
        "tool.edit",
        "tool.glob",
        "tool.grep",
        "tool.bash",
        "tool.todo",
        "plugin.subagent",
        "plugin.mcp",
        "plugin.skill",
        "plugin.agent-context",
    ],
};

export class CLI {
    private config!: CLIConfig;
    private activeModel!: CLIModel;
    private userSystemPrompt = "You are a helpful assistant.";
    private agent!: MiniAgent;
    private manager!: LLMEngineManager;
    private rl!: Interface;
    private baseDir!: string;
    private persistDir!: string;
    private sessionManager!: SessionManager;
    private compressor!: ContextCompressor;
    private blueprintRegistry!: AgentBlueprintRegistry;
    private assembler!: AgentAssembler;
    private hitlEnabled = true;
    private running = false;

    private buildModelsMap(): Map<string, ModelGroup> {
        const map = new Map<string, ModelGroup>();
        for (const m of this.config.models) {
            const group = map.get(m.provider);
            if (group) {
                group.models.push(toModelConfig(m));
            } else {
                map.set(m.provider, { models: [toModelConfig(m)] });
            }
        }
        return map;
    }

    async start(): Promise<void> {
        this.baseDir = process.cwd();
        this.config = await loadConfig(this.baseDir);

        if (this.config.models.length === 0) {
            console.error(`${A.red}No models configured. Edit .cliagent/config.json${A.reset}`);
            process.exit(1);
        }

        const defaultModel = findModel(this.config);
        if (!defaultModel) {
            console.error(
                `${A.red}Default model "${this.config.defaultModel}" not found${A.reset}`,
            );
            process.exit(1);
        }

        this.persistDir = join(this.baseDir, CLIAGENT_DIR);
        this.manager = new LLMEngineManager();
        this.registerEngines();
        this.blueprintRegistry = this.createBlueprintRegistry();
        this.assembler = new AgentAssembler(this.blueprintRegistry);

        this.activeModel = defaultModel;
        this.userSystemPrompt = this.config.systemPrompt ?? "You are a helpful assistant.";

        this.sessionManager = new SessionManager(this.persistDir);
        await this.sessionManager.load();

        const sessions = this.sessionManager.list();
        let session: SessionMeta;
        if (sessions.length > 0) {
            session = sessions[0]!;
            this.sessionManager.setActive(session.id);
        } else {
            session = await this.sessionManager.create("default");
        }

        this.agent = await this.buildAgent(session.id);

        console.log(
            `${A.green}MiniAgent CLI${A.reset} — model: ${A.bold}${this.activeModel.name}${A.reset} (${this.activeModel.provider}/${this.activeModel.model})`,
        );
        console.log(
            `Session: ${A.cyan}${session.name}${A.reset} | HITL: ${this.hitlEnabled ? `${A.green}on${A.reset}` : `${A.yellow}off${A.reset}`}`,
        );
        console.log(
            `Type ${A.cyan}/help${A.reset} for commands, ${A.cyan}/quit${A.reset} to exit.\n`,
        );

        this.rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        this.rl.setPrompt(`${A.bold}>${A.reset} `);
        this.rl.prompt();

        this.rl.on("line", async (line: string) => {
            if (this.running) return;
            const input = line.trim();
            if (!input) {
                this.rl.prompt();
                return;
            }

            if (input.startsWith("/")) {
                await this.handleCommand(input);
                this.rl.prompt();
                return;
            }

            this.running = true;
            const userMsg: Message = {
                id: crypto.randomUUID(),
                type: MessageType.User,
                content: input,
            };

            try {
                await this.agent.run(userMsg);
                const active = this.sessionManager.getActive();
                if (active) {
                    const msgs = await this.agent.getMessages();
                    await this.sessionManager.updateMeta(active.id, {
                        messageCount: msgs.length,
                        model: this.activeModel.name,
                    });
                }
                await this.tryCompress();
            } catch (e: unknown) {
                process.stdout.write(
                    `\n${A.red}${e instanceof Error ? e.message : String(e)}${A.reset}\n`,
                );
            }

            this.printTokenUsage();
            this.running = false;
            process.stdout.write("\n");
            this.rl.prompt();
        });

        this.rl.on("close", () => {
            process.exit(0);
        });
    }

    private buildSystemPrompt(): string {
        return [
            this.userSystemPrompt,
            "",
            `Working directory: ${this.baseDir}`,
            "You have access to tools for reading, writing, editing, searching files, executing bash commands, managing tasks, and spawning sub-agents.",
            "Use tools proactively to accomplish tasks. For file operations, always use the appropriate tool.",
        ].join("\n");
    }

    private createBlueprintRegistry(): AgentBlueprintRegistry {
        const registry = new AgentBlueprintRegistry();

        registry.register("tool.read", () => readTool);
        registry.register("tool.write", () => writeTool);
        registry.register("tool.edit", () => editTool);
        registry.register("tool.glob", () => globTool);
        registry.register("tool.grep", () => grepTool);
        registry.register("tool.bash", () => bashTool);
        registry.register("tool.todo", () => new TodoManager());
        registry.register("plugin.subagent", () => new SubAgentProvider(this.createAgentFactory()));
        registry.register("plugin.mcp", () => new McpPlugin());
        registry.register("plugin.skill", () => new SkillPlugin());
        registry.register("plugin.agent-context", () => new AgentContextProvider(this.baseDir));

        return registry;
    }

    private createAgentFactory(): AgentFactory {
        return async (task: string, systemPrompt: string): Promise<MiniAgent> => {
            const active = this.sessionManager.getActive();
            const sessionId = active?.id ?? "temp";
            const persistDir = this.sessionManager.getSessionPersistDir(sessionId);

            const subPlugins = new Map<string, JsonValue>();
            if (this.config.mcp) {
                subPlugins.set("mcp", JSON.parse(JSON.stringify(this.config.mcp)) as JsonValue);
            }
            if (this.config.skill) {
                subPlugins.set("skill", JSON.parse(JSON.stringify(this.config.skill)) as JsonValue);
            }

            const agentConfig: AgentConfig = {
                model: toModelConfig(this.activeModel),
                models: this.buildModelsMap(),
                plugins: subPlugins,
                paths: { sessiondir: join(persistDir, `subagent-${crypto.randomUUID().slice(0, 8)}`) },
            };
            return this.assembler.assemble({
                llm: this.manager,
                config: agentConfig,
                blueprint: SHARED_BLUEPRINT,
                extraUses: [
                    defineAgentModule({
                        priority: 0,
                        collect: async (): Promise<Message[]> => [
                            {
                                id: "system-prompt",
                                type: MessageType.System,
                                content: systemPrompt || `You are a focused sub-agent. Task: ${task}. Working directory: ${this.baseDir}`,
                            },
                        ],
                    }),
                ],
            });
        };
    }

    private async buildAgent(sessionId: string): Promise<MiniAgent> {
        const persistDir = this.sessionManager.getSessionPersistDir(sessionId);
        const plugins = new Map<string, JsonValue>();
        if (this.config.mcp) {
            plugins.set("mcp", JSON.parse(JSON.stringify(this.config.mcp)) as JsonValue);
        }
        if (this.config.skill) {
            plugins.set("skill", JSON.parse(JSON.stringify(this.config.skill)) as JsonValue);
        }
        const agentConfig: AgentConfig = {
            model: toModelConfig(this.activeModel),
            models: this.buildModelsMap(),
            plugins,
            paths: { sessiondir: persistDir },
        };
        this.compressor = new ContextCompressor(this.manager, toModelConfig(this.activeModel), {
            maxMessages: 60,
            keepRecent: 15,
        });
        const agent = await this.assembler.assemble({
            llm: this.manager,
            config: agentConfig,
            blueprint: SHARED_BLUEPRINT,
            extraUses: [
                defineAgentModule({
                    priority: 0,
                    collect: async (): Promise<Message[]> => [
                        { id: "system-prompt", type: MessageType.System, content: this.buildSystemPrompt() },
                    ],
                }),
                this.compressor,
                (createdAgent: MiniAgent): void => {
                    createdAgent.setAutoApprovedTools(AUTO_APPROVE_TOOLS);
                    createdAgent.register(
                        defineAgentModule({
                            requestApproval: async (toolName: string, args: Record<string, unknown>): Promise<ApprovalDecision> => {
                                if (!this.hitlEnabled) return "approve";
                                return this.cliApprove(toolName, args);
                            },
                        }),
                    );
                },
            ],
        });
        this.setupStreaming(agent);
        return agent;
    }

    private registerEngines(): void {
        const seen = new Set<string>();
        for (const m of this.config.models) {
            if (seen.has(m.provider)) continue;
            const ctor = ENGINES[m.provider];
            if (!ctor) {
                console.warn(`${A.yellow}Unknown provider: ${m.provider}, skipping${A.reset}`);
                continue;
            }
            this.manager.register(m.provider, ctor);
            seen.add(m.provider);
        }
    }

    private cliApprove(toolName: string, args: Record<string, unknown>): Promise<ApprovalDecision> {
        const argsStr = JSON.stringify(args, null, 2);
        const display = argsStr.length > 500 ? `${argsStr.slice(0, 497)}...` : argsStr;
        process.stdout.write(
            `\n${A.yellow}[HITL]${A.reset} Tool call: ${A.bold}${toolName}${A.reset}\n${A.dim}${display}${A.reset}\n`,
        );
        process.stdout.write(
            `${A.yellow}Approve?${A.reset} [y]es / [n]o / [a]lways: `,
        );

        return new Promise((resolve) => {
            const handler = (line: string) => {
                this.rl.removeListener("line", handler);
                const trimmed = line.trim().toLowerCase();
                if (trimmed === "a" || trimmed === "always") {
                    resolve("approve_all");
                } else if (trimmed === "n" || trimmed === "no") {
                    resolve("deny");
                } else {
                    resolve("approve");
                }
            };
            this.rl.once("line", handler);
        });
    }

    private setupStreaming(agent: MiniAgent): void {
        agent.on("llm:chunk", ({ chunk }: { chunk: LLMStreamChunk }) => {
            if (chunk.type === LLMStreamChunkType.TextDelta) {
                process.stdout.write(chunk.text);
            } else if (chunk.type === LLMStreamChunkType.ReasoningDelta) {
                process.stdout.write(`${A.dim}${chunk.text}${A.reset}`);
            }
        });

        agent.on("tool:execute", ({ toolCall }: { toolCall: ToolCallMessage }) => {
            const argsStr = JSON.stringify(toolCall.arguments);
            const display =
                argsStr.length > 100 ? `${argsStr.slice(0, 97)}...` : argsStr;
            process.stdout.write(`\n${A.cyan}⟳ ${toolCall.toolName}(${display})${A.reset}\n`);
        });

        agent.on(
            "tool:result",
            ({
                result,
            }: { toolCall: ToolCallMessage; result: ToolResultMessage }) => {
                const content = String(result.content);
                const display =
                    content.length > 200 ? `${content.slice(0, 197)}...` : content;
                process.stdout.write(`  ${A.dim}→ ${display}${A.reset}\n`);
            },
        );

        agent.on("run:error", ({ error }: { error: unknown; turn: number }) => {
            process.stdout.write(
                `\n${A.red}Error: ${error instanceof Error ? error.message : String(error)}${A.reset}\n`,
            );
        });
    }

    private printTokenUsage(): void {
        const tc = this.agent.getContextCount();
        process.stdout.write(
            `\n${A.dim}ctx tokens: ${tc.input.toLocaleString()} in / ${tc.output.toLocaleString()} out / ${tc.total.toLocaleString()} total${A.reset}`,
        );
    }

    private async tryCompress(): Promise<void> {
        const messages = await this.agent.getMessages();
        this.compressor.updateMessages(messages);
        await this.compressor.maybeCompress();
    }

    private async handleCommand(input: string): Promise<void> {
        const spaceIdx = input.indexOf(" ");
        const cmd = spaceIdx === -1 ? input : input.slice(0, spaceIdx);
        const arg = spaceIdx === -1 ? "" : input.slice(spaceIdx + 1).trim();

        switch (cmd) {
            case "/quit":
            case "/exit": {
                console.log(`${A.dim}Bye.${A.reset}`);
                this.rl.close();
                break;
            }

            case "/help": {
                this.printHelp();
                break;
            }

            case "/models": {
                const displayList = this.agent.getModelDisplayList();
                const current = this.agent.getCurrentModel();
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
                    const current = this.agent.getCurrentModel();
                    console.log(
                        `Current: ${A.bold}${current.provider}/${current.model}${A.reset}`,
                    );
                    break;
                }
                try {
                    this.agent.setModelByPath(arg);
                    const current = this.agent.getCurrentModel();
                    const found = this.config.models.find(
                        (m) => m.provider === current.provider && m.model === current.model,
                    );
                    if (found) this.activeModel = found;
                    console.log(
                        `Switched to ${A.bold}${current.provider}/${current.model}${A.reset}`,
                    );
                } catch (e: unknown) {
                    console.log(`${A.red}${e instanceof Error ? e.message : String(e)}${A.reset}`);
                }
                break;
            }

            case "/tools": {
                try {
                    const tools = await this.agent.getToolList();
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
                const active = this.sessionManager.getActive();
                if (active) {
                    this.agent = await this.buildAgent(active.id);
                }
                console.log(`${A.green}Conversation cleared.${A.reset}`);
                break;
            }

            case "/system": {
                if (!arg) {
                    console.log(`System prompt: ${this.userSystemPrompt}`);
                    break;
                }
                this.userSystemPrompt = arg;
                console.log("System prompt updated.");
                break;
            }

            case "/history": {
                await this.showHistory(arg);
                break;
            }

            case "/sessions":
            case "/session": {
                if (!arg) {
                    await this.listSessions();
                } else if (arg === "new") {
                    await this.createSession();
                } else if (arg.startsWith("switch ")) {
                    await this.switchSession(arg.slice(7).trim());
                } else if (arg.startsWith("delete ")) {
                    await this.deleteSession(arg.slice(7).trim());
                } else if (arg.startsWith("rename ")) {
                    const parts = arg.slice(7).trim();
                    const sep = parts.indexOf(" ");
                    if (sep === -1) {
                        console.log(`${A.red}Usage: /session rename <id_prefix> <new_name>${A.reset}`);
                    } else {
                        await this.renameSession(parts.slice(0, sep), parts.slice(sep + 1));
                    }
                } else {
                    console.log(`${A.red}Unknown session sub-command. Use: new, switch, delete, rename${A.reset}`);
                }
                break;
            }

            case "/hitl": {
                if (arg === "on") {
                    this.hitlEnabled = true;
                    console.log(`${A.green}Human-in-the-loop enabled.${A.reset}`);
                } else if (arg === "off") {
                    this.hitlEnabled = false;
                    console.log(`${A.yellow}Human-in-the-loop disabled.${A.reset}`);
                } else {
                    console.log(`HITL: ${this.hitlEnabled ? `${A.green}on${A.reset}` : `${A.yellow}off${A.reset}`}`);
                }
                break;
            }

            case "/compress": {
                await this.tryCompress();
                const count = this.compressor.getCompressedCount();
                console.log(`${A.green}Compressed ${count} messages.${A.reset}`);
                break;
            }

            case "/context": {
                const ctx = await this.agent.previewContext();
                console.log(`${A.bold}Context (${ctx.length} messages):${A.reset}`);
                for (const msg of ctx) {
                    this.printMessageSummary(msg);
                }
                break;
            }

            default:
                console.log(`${A.red}Unknown command: ${cmd}${A.reset}`);
                this.printHelp();
        }
    }

    private async showHistory(arg: string): Promise<void> {
        const messages = await this.agent.getMessages();
        let page = 1;
        const pageSize = 20;
        if (arg) {
            const parsed = Number(arg);
            if (!isNaN(parsed) && parsed > 0) {
                page = parsed;
            }
        }

        const totalPages = Math.max(1, Math.ceil(messages.length / pageSize));
        const start = (page - 1) * pageSize;
        const end = Math.min(start + pageSize, messages.length);
        const pageMessages = messages.slice(start, end);

        if (pageMessages.length === 0) {
            console.log(`${A.yellow}No messages on page ${page}.${A.reset}`);
            return;
        }

        console.log(`${A.bold}History (page ${page}/${totalPages}, ${messages.length} total):${A.reset}\n`);
        for (const msg of pageMessages) {
            this.printMessage(msg);
        }
        if (page < totalPages) {
            console.log(`\n${A.dim}Use /history ${page + 1} for next page${A.reset}`);
        }
    }

    private printMessage(msg: Message): void {
        const typeColors: Record<string, string> = {
            [MessageType.System]: A.magenta,
            [MessageType.User]: A.green,
            [MessageType.Assist]: A.cyan,
            [MessageType.ToolCall]: A.yellow,
            [MessageType.ToolResult]: A.dim,
        };
        const color = typeColors[msg.type] ?? "";
        const label = msg.type.padEnd(12);

        let content: string;
        if (msg.type === MessageType.ToolCall) {
            const tc = msg as ToolCallMessage;
            content = `${tc.toolName}(${JSON.stringify(tc.arguments).slice(0, 80)})`;
        } else {
            content = typeof msg.content === "string"
                ? msg.content
                : msg.content.type === "text" ? msg.content.text : "[image]";
        }

        const display = content.length > 150 ? `${content.slice(0, 147)}...` : content;
        console.log(`  ${color}${label}${A.reset} ${display}`);
    }

    private printMessageSummary(msg: Message): void {
        const typeColors: Record<string, string> = {
            [MessageType.System]: A.magenta,
            [MessageType.User]: A.green,
            [MessageType.Assist]: A.cyan,
            [MessageType.ToolCall]: A.yellow,
            [MessageType.ToolResult]: A.dim,
        };
        const color = typeColors[msg.type] ?? "";
        const content = typeof msg.content === "string"
            ? msg.content
            : msg.content.type === "text" ? msg.content.text : "[image]";
        const display = content.length > 80 ? `${content.slice(0, 77)}...` : content;
        console.log(`  ${color}${msg.type}${A.reset} ${display}`);
    }

    private async listSessions(): Promise<void> {
        const sessions = this.sessionManager.list();
        const active = this.sessionManager.getActive();
        if (sessions.length === 0) {
            console.log(`${A.yellow}No sessions. Use /session new to create one.${A.reset}`);
            return;
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
    }

    private async createSession(): Promise<void> {
        const session = await this.sessionManager.create();
        this.sessionManager.setActive(session.id);
        this.agent = await this.buildAgent(session.id);
        console.log(`${A.green}Created & switched to session: ${A.bold}${session.name}${A.reset} (${session.id.slice(0, 8)})`);
    }

    private async switchSession(idPrefix: string): Promise<void> {
        const sessions = this.sessionManager.list();
        const match = sessions.find((s) => s.id.startsWith(idPrefix) || s.name === idPrefix);
        if (!match) {
            console.log(`${A.red}Session not found: ${idPrefix}${A.reset}`);
            return;
        }
        this.sessionManager.setActive(match.id);
        this.agent = await this.buildAgent(match.id);
        console.log(`${A.green}Switched to session: ${A.bold}${match.name}${A.reset} (${match.messageCount} messages)`);
    }

    private async deleteSession(idPrefix: string): Promise<void> {
        const sessions = this.sessionManager.list();
        const match = sessions.find((s) => s.id.startsWith(idPrefix) || s.name === idPrefix);
        if (!match) {
            console.log(`${A.red}Session not found: ${idPrefix}${A.reset}`);
            return;
        }
        if (sessions.length <= 1) {
            console.log(`${A.red}Cannot delete the last session.${A.reset}`);
            return;
        }
        const active = this.sessionManager.getActive();
        const wasActive = active !== undefined && match.id === active.id;
        await this.sessionManager.delete(match.id);
        console.log(`${A.green}Deleted session: ${match.name}${A.reset}`);
        if (wasActive) {
            const remaining = this.sessionManager.list();
            if (remaining.length > 0) {
                const next = remaining[0]!;
                this.sessionManager.setActive(next.id);
                this.agent = await this.buildAgent(next.id);
                console.log(`${A.green}Switched to session: ${A.bold}${next.name}${A.reset}`);
            }
        }
    }

    private async renameSession(idPrefix: string, newName: string): Promise<void> {
        const sessions = this.sessionManager.list();
        const match = sessions.find((s) => s.id.startsWith(idPrefix) || s.name === idPrefix);
        if (!match) {
            console.log(`${A.red}Session not found: ${idPrefix}${A.reset}`);
            return;
        }
        await this.sessionManager.updateMeta(match.id, { name: newName });
        console.log(`${A.green}Renamed session to: ${A.bold}${newName}${A.reset}`);
    }

    private printHelp(): void {
        const lines = [
            `${A.bold}Commands:${A.reset}`,
            `  ${A.cyan}/models${A.reset}                List configured models`,
            `  ${A.cyan}/model <provider/model>${A.reset} Switch active model`,
            `  ${A.cyan}/tools${A.reset}                 List registered tools`,
            `  ${A.cyan}/history [page]${A.reset}        View conversation history`,
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
}

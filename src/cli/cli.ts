import { createInterface, type Interface } from "node:readline";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { MiniAgent } from "../core/agent.js";
import { LLMEngineManager } from "../core/llm.js";
import { MessageType, LLMStreamChunkType } from "../core/types.js";
import type {
  Message,
  LLMStreamChunk,
  ToolCallMessage,
  ToolResultMessage,
} from "../core/types.js";
import type { AgentConfig } from "../core/config.js";
import type { LLMEngineCtor } from "../core/llm.js";
import { AnthropicEngine } from "../engine/anthropic/index.js";
import { OpenAIEngine } from "../engine/openai/index.js";
import { OpenAICompatibleEngine } from "../engine/openai-compatible/index.js";
import { GLMEngine } from "../engine/glm/index.js";
import { GLMCodePlanEngine } from "../engine/glm-codeplan/index.js";
import { readTool, writeTool, editTool, globTool, grepTool, TodoManager } from "../tool/index.js";
import { CLIAGENT_DIR, loadConfig, findModel, toModelConfig } from "./config.js";
import type { CLIConfig, CLIModel } from "./config.js";

const A = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

const ENGINES: Record<string, LLMEngineCtor> = {
  anthropic: AnthropicEngine,
  openai: OpenAIEngine,
  "openai-compatible": OpenAICompatibleEngine,
  glm: GLMEngine,
  "glm-codeplan": GLMCodePlanEngine,
};

const BUILTIN_TOOLS = [readTool, writeTool, editTool, globTool, grepTool];

export class CLI {
  private config!: CLIConfig;
  private activeModel!: CLIModel;
  private userSystemPrompt = "You are a helpful assistant.";
  private agent!: MiniAgent;
  private manager!: LLMEngineManager;
  private rl!: Interface;
  private baseDir!: string;
  private persistDir!: string;

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

    this.activeModel = defaultModel;
    this.userSystemPrompt = this.config.systemPrompt ?? "You are a helpful assistant.";
    this.agent = this.buildAgent();

    console.log(
      `${A.green}MiniAgent CLI${A.reset} — model: ${A.bold}${this.activeModel.name}${A.reset} (${this.activeModel.provider}/${this.activeModel.model})`,
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

      const userMsg: Message = {
        id: crypto.randomUUID(),
        type: MessageType.User,
        content: input,
      };

      try {
        await this.agent.run(userMsg);
      } catch (e: unknown) {
        process.stdout.write(
          `\n${A.red}${e instanceof Error ? e.message : String(e)}${A.reset}\n`,
        );
      }

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
      "Respond conversationally by default. Only use tools when the user explicitly asks you to read, write, edit, search files, or manage tasks. Do not use file tools for simple questions or greetings.",
    ].join("\n");
  }

  private buildAgent(): MiniAgent {
    const agentConfig: AgentConfig = {
      model: toModelConfig(this.activeModel),
      paths: { basepersistdir: this.persistDir },
    };
    const agent = new MiniAgent(this.manager, agentConfig);
    this.registerTools(agent);
    agent.register({
      priority: 0,
      collect: async (): Promise<Message[]> => [
        { id: "system-prompt", type: MessageType.System, content: this.buildSystemPrompt() },
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

  private registerTools(agent: MiniAgent): void {
    for (const tool of BUILTIN_TOOLS) {
      agent.register(tool);
    }
    agent.register(new TodoManager());
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
        console.log(`${A.bold}Models:${A.reset}`);
        for (const m of this.config.models) {
          const marker =
            m.name === this.activeModel.name ? ` ${A.green}← active${A.reset}` : "";
          console.log(`  ${A.cyan}${m.name}${A.reset} (${m.provider}/${m.model})${marker}`);
        }
        break;
      }

      case "/model": {
        if (!arg) {
          console.log(
            `Current: ${A.bold}${this.activeModel.name}${A.reset} (${this.activeModel.provider}/${this.activeModel.model})`,
          );
          break;
        }
        const found = findModel(this.config, arg);
        if (!found) {
          console.log(`${A.red}"${arg}" not found. Use /models to list.${A.reset}`);
          break;
        }
        this.activeModel = found;
        this.agent.setConfig({
          ...this.agent.getConfig(),
          model: toModelConfig(found),
        });
        console.log(
          `Switched to ${A.bold}${found.name}${A.reset} (${found.provider}/${found.model})`,
        );
        break;
      }

      case "/tools": {
        console.log(`${A.bold}Tools:${A.reset}`);
        for (const t of BUILTIN_TOOLS) {
          console.log(`  ${A.cyan}${t.name}${A.reset} — ${t.description}`);
        }
        console.log(
          `  ${A.cyan}todo_create${A.reset}, ${A.cyan}todo_update${A.reset}, ${A.cyan}todo_delete${A.reset} — Todo management`,
        );
        break;
      }

      case "/clear": {
        try {
          await unlink(join(this.persistDir, "messages.jsonl"));
        } catch {
          void 0;
        }
        this.agent = this.buildAgent();
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

      default:
        console.log(`${A.red}Unknown command: ${cmd}${A.reset}`);
        this.printHelp();
    }
  }

  private printHelp(): void {
    const lines = [
      `${A.bold}Commands:${A.reset}`,
      `  ${A.cyan}/models${A.reset}            List configured models`,
      `  ${A.cyan}/model <name>${A.reset}      Switch active model`,
      `  ${A.cyan}/tools${A.reset}             List registered tools`,
      `  ${A.cyan}/clear${A.reset}             Clear conversation history`,
      `  ${A.cyan}/system <text>${A.reset}     Update system prompt`,
      `  ${A.cyan}/help${A.reset}              Show this help`,
      `  ${A.cyan}/quit${A.reset}              Exit`,
    ];
    console.log(lines.join("\n"));
  }
}

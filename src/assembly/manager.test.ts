import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { AgentBlueprintSchema } from "./blueprint.js";
import { BlueprintManager } from "./manager.js";
import { LLMStreamChunkType, MessageType, type Message, type MessageChunk } from "../core/types.js";
import { ThinkingLevel, type AgentConfig, type LLMGenerateRequest, type ModelPreset } from "../core/config.js";
import type { AgentUse } from "../core/create-agent.js";
import type { LLMEngine } from "../core/llm.js";

function createConfig(basepersistdir: string): AgentConfig {
    return {
        providers: [{
            provider: "test",
            key: "test-key",
            models: [],
        }],
        defaultModel: {
            provider: "test",
            model: "test-model",
        },
        paths: { sessiondir: basepersistdir },
    };
}

function textChunk(text: string): MessageChunk {
    return {
        type: LLMStreamChunkType.TextDelta,
        text,
    };
}

function createEngine(onInvoke?: (messages: Message[]) => void): LLMEngine {
    return {
        name: "test",
        getModels(): ModelPreset[] {
            return [{
                id: "test-model",
                name: "test-model",
                thinkingLevels: [ThinkingLevel.None],
            }];
        },
        async *streamGenerate(request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
            onInvoke?.(request.messages);
            yield textChunk("done");
        },
    };
}

describe("AgentBlueprintSchema", () => {
    it("accepts semantic blueprint shape", () => {
        const parsed = AgentBlueprintSchema.parse({
            engines: [{ use: "test", config: { response: "ok" } }],
            tools: [{ use: "echo" }],
            compression: { use: "summary" },
            persistence: { use: "file" },
            mcp: { use: "server" },
            skill: { use: "reader" },
            subagent: { use: "worker" },
            approval: { use: "manual" },
            context: [{ use: "workspace" }],
            custom: {
                memory: { use: "local" },
                observers: [{ use: "log" }],
            },
        });

        expect(parsed.engines?.map((item) => item.use)).toEqual(["test"]);
        expect(parsed.custom?.["memory"]).toEqual({ use: "local" });
    });

    it("rejects old uses shape", () => {
        expect(() => AgentBlueprintSchema.parse({
            uses: ["tool.echo"],
        })).toThrow();
    });
});

describe("BlueprintManager", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), "miniagent-blueprint-manager-test-"));
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it("registers and lists preset implementations", () => {
        const manager = new BlueprintManager();

        manager.registerEngineImpl("test", {
            configSchema: z.object({}).strict(),
            create: () => createEngine(),
        });
        manager.registerToolImpl("echo", {
            configSchema: z.object({}).strict(),
            create: () => ({
                name: "echo",
                description: "Echoes text",
                parameters: z.object({
                    text: z.string(),
                }),
                execute: async (args: Record<string, unknown>): Promise<string> => String(args["text"]),
            }),
        });

        expect(manager.listImpls("engine")).toEqual(["test"]);
        expect(manager.listImpls("tool")).toEqual(["echo"]);
    });

    it("rejects duplicate preset implementations", () => {
        const manager = new BlueprintManager();
        const impl = {
            configSchema: z.object({}).strict(),
            create: () => createEngine(),
        };

        manager.registerEngineImpl("test", impl);

        expect(() => manager.registerEngineImpl("test", impl))
            .toThrow("Blueprint implementation is already registered: engine/test");
    });

    it("rejects custom types that collide with preset domains", () => {
        const manager = new BlueprintManager();

        expect(() => manager.registerCustomType("engine"))
            .toThrow("Custom blueprint type conflicts with preset domain: engine.");
    });

    it("rejects duplicate custom type registration", () => {
        const manager = new BlueprintManager();

        manager.registerCustomType("memory");

        expect(() => manager.registerCustomType("memory"))
            .toThrow("Custom blueprint type is already registered: memory");
    });

    it("rejects custom implementation registration before type registration", () => {
        const manager = new BlueprintManager();

        expect(() => manager.registerCustomImpl("memory", "local", {
            configSchema: z.object({}).strict(),
            create: () => [],
        })).toThrow("Unknown custom blueprint type: memory.");
    });

    it("passes explicit null config to implementation schemas", async () => {
        const manager = new BlueprintManager();
        const receivedConfigs: null[] = [];

        manager.registerEngineImpl("test", {
            configSchema: z.null(),
            create: (config) => {
                receivedConfigs.push(config);
                return createEngine();
            },
        });

        const agent = await manager.assemble({
            blueprint: {
                engines: [{ use: "test", config: null }],
            },
            config: createConfig(testDir),
        });

        expect(receivedConfigs).toEqual([null]);
        expect(agent.getModelDisplayList()).toEqual(["test-model"]);
    });

    it("assembles a fake LLM engine, fake tool, and fake context module into a working MiniAgent", async () => {
        const manager = new BlueprintManager();
        const seenMessages: Message[][] = [];

        manager.registerEngineImpl("test", {
            configSchema: z.object({
                response: z.string(),
            }).strict(),
            create: (_config) => createEngine((messages) => {
                seenMessages.push(messages);
            }),
        });
        manager.registerToolImpl("echo", {
            configSchema: z.object({
                suffix: z.string(),
            }).strict(),
            create: (config) => ({
                name: "echo",
                description: "Echoes text",
                parameters: z.object({
                    text: z.string(),
                }),
                execute: async (args: Record<string, unknown>): Promise<string> =>
                    `${String(args["text"])}${config.suffix}`,
            }),
        });
        manager.registerContextImpl("system", {
            configSchema: z.object({
                content: z.string(),
            }).strict(),
            create: (config) => ({
                priority: 0,
                collect: async (): Promise<Message[]> => [{
                    id: "system-1",
                    type: MessageType.System,
                    content: config.content,
                }],
            }),
        });

        const extraInstallerCalls: string[] = [];
        const extraUse: AgentUse = (agent) => {
            extraInstallerCalls.push(agent.getGuid());
        };

        const agent = await manager.assemble({
            blueprint: {
                engines: [{ use: "test", config: { response: "done" } }],
                tools: [{ use: "echo", config: { suffix: "!" } }],
                context: [{ use: "system", config: { content: "system" } }],
            },
            config: createConfig(testDir),
            extraUses: [extraUse],
        });

        const tools = await agent.getToolList();
        const toolResult = await tools[0]!.execute({ text: "hello" });
        await agent.run({
            id: "user-1",
            type: MessageType.User,
            content: "hello",
        });

        expect(tools.map((tool) => tool.name)).toEqual(["echo"]);
        expect(toolResult).toBe("hello!");
        expect(extraInstallerCalls).toEqual([agent.getGuid()]);
        expect(seenMessages[0]!.map((message) => message.id)).toEqual(["system-1", "user-1"]);
        expect((await agent.getMessages()).map((message) => message.type)).toEqual([
            MessageType.User,
            MessageType.Assist,
        ]);
    });

    it("includes domain and name in invalid config errors", async () => {
        const manager = new BlueprintManager();

        manager.registerEngineImpl("test", {
            configSchema: z.object({
                enabled: z.boolean(),
            }).strict(),
            create: () => createEngine(),
        });

        await expect(manager.assemble({
            blueprint: {
                engines: [{ use: "test", config: { enabled: "yes" } }],
            },
            config: createConfig(testDir),
        })).rejects.toThrow("Invalid blueprint config for engine/test");
    });

    it("destroys created agent uses when a later implementation fails during assembly", async () => {
        const manager = new BlueprintManager();
        const destroyed: string[] = [];

        manager.registerToolImpl("destroyable", {
            configSchema: z.object({}).strict(),
            create: () => ({
                name: "destroyable",
                description: "A destroyable test tool",
                parameters: z.object({}),
                execute: async (): Promise<string> => "ok",
                destroy: async (): Promise<void> => {
                    destroyed.push("destroyable");
                },
            }),
        });
        manager.registerToolImpl("failing", {
            configSchema: z.object({}).strict(),
            create: () => {
                throw new Error("later implementation failed");
            },
        });

        await expect(manager.assemble({
            blueprint: {
                tools: [{ use: "destroyable" }, { use: "failing" }],
            },
            config: createConfig(testDir),
        })).rejects.toThrow("later implementation failed");

        expect(destroyed).toEqual(["destroyable"]);
    });

    it("includes domain and name in unknown implementation errors", async () => {
        const manager = new BlueprintManager();

        await expect(manager.assemble({
            blueprint: {
                tools: [{ use: "missing" }],
            },
            config: createConfig(testDir),
        })).rejects.toThrow("Unknown blueprint implementation: tool/missing.");
    });
});

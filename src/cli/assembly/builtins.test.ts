import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { AgentBlueprintSchema } from "./blueprint.js";
import { BlueprintManager } from "./manager.js";
import {
    type DefaultBlueprintOptions,
    createDefaultBlueprint,
    registerBuiltinBlueprintImpls,
} from "./builtins.js";
import { ThinkingLevel, type AgentConfig, type LLMGenerateRequest } from "../../core/index.js";
import { LLMStreamChunkType, MessageType, type Message, type MessageChunk, type ToolCallMessage } from "../../core/index.js";
import type { LLMEngine } from "../../core/index.js";
import type { ConfiguredSubagentFactory } from "../../extensions/index.js";

function createConfig(sessiondir: string): AgentConfig {
    return {
        paths: { sessiondir },
    };
}

function createSubagentFactory(): ConfiguredSubagentFactory {
    return async () => {
        throw new Error("Subagent factory should not be called in builtins tests");
    };
}

function createTestEngine(onInvoke: (request: LLMGenerateRequest) => void): LLMEngine {
    return {
        name: "test",
        async *streamGenerate(request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
            onInvoke(request);
            yield {
                type: LLMStreamChunkType.TextDelta,
                text: "summary",
            };
        },
    };
}

function createMessages(count: number): Message[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `message-${index}`,
        type: MessageType.User,
        content: `message ${index}`,
    }));
}

interface CompressorProbe {
    updateMessages(messages: Message[]): void;
    maybeCompress(): Promise<void>;
    getSummary(): string | null;
}

function createToolCall(toolName: string): ToolCallMessage {
    return {
        id: crypto.randomUUID(),
        type: MessageType.ToolCall,
        content: "",
        toolCallId: crypto.randomUUID(),
        toolName,
        arguments: {},
    };
}

describe("registerBuiltinBlueprintImpls", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), "miniagent-builtins-test-"));
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it("registers expected implementation names for each preset domain", () => {
        const manager = new BlueprintManager();

        registerBuiltinBlueprintImpls(manager, {
            subagentFactory: createSubagentFactory(),
        });

        expect(manager.listImpls("engine")).toEqual([
            "anthropic",
            "openai",
            "openai-compatible",
            "glm",
            "glm-codeplan",
            "nvidia",
        ]);
        expect(manager.listImpls("tool")).toEqual([
            "read",
            "write",
            "edit",
            "glob",
            "grep",
            "bash",
            "todo",
        ]);
        expect(manager.listImpls("compression")).toEqual(["summary"]);
        expect(manager.listImpls("persistence")).toEqual(["file"]);
        expect(manager.listImpls("mcp")).toEqual(["config"]);
        expect(manager.listImpls("skill")).toEqual(["local-directory"]);
        expect(manager.listImpls("subagent")).toEqual(["local-directory-sync"]);
        expect(manager.listImpls("approval")).toEqual(["static-auto-approve"]);
        expect(manager.listImpls("context")).toEqual(["system-prompt", "agent-context"]);
    });

    it("assembles createDefaultBlueprint output with built-in tools and optional plugins", async () => {
        const manager = new BlueprintManager();
        const config = createConfig(testDir);
        const skillDir = await mkdtemp(join(testDir, "skills-"));
        const subagentDir = await mkdtemp(join(testDir, "subagents-"));

        registerBuiltinBlueprintImpls(manager, {
            subagentFactory: createSubagentFactory(),
        });

        const agent = await manager.assemble({
            blueprint: createDefaultBlueprint({
                engines: ["openai"],
                persistence: {
                    rootDir: testDir,
                    fileName: "messages.jsonl",
                },
                mcp: { servers: {} },
                skill: { directories: [skillDir] },
                subagent: { path: subagentDir },
                systemPrompt: {
                    prompt: "You are a test agent.",
                    baseDir: testDir,
                },
                agentContext: { baseDir: testDir },
            }),
            config,
        });

        const toolNames = (await agent.getToolList()).map((tool) => tool.name);

        expect(toolNames).toEqual(expect.arrayContaining([
            "read",
            "write",
            "bash",
            "todo_create",
        ]));
    });

    it("makes static-auto-approve deny non-auto-approved tools only while HITL is enabled", async () => {
        const hitlManager = new BlueprintManager();
        const noHitlManager = new BlueprintManager();

        registerBuiltinBlueprintImpls(hitlManager, {
            subagentFactory: createSubagentFactory(),
            getHITL: () => true,
        });
        registerBuiltinBlueprintImpls(noHitlManager, {
            subagentFactory: createSubagentFactory(),
            getHITL: () => false,
        });

        const hitlAgent = await hitlManager.assemble({
            blueprint: {
                approval: {
                    use: "static-auto-approve",
                    config: { autoApproveTools: ["read"] },
                },
            },
            config: createConfig(testDir),
        });
        const noHitlAgent = await noHitlManager.assemble({
            blueprint: {
                approval: {
                    use: "static-auto-approve",
                    config: { autoApproveTools: ["read"] },
                },
            },
            config: createConfig(testDir),
        });

        await expect(hitlAgent.execute(createToolCall("read")))
            .resolves.toEqual(expect.objectContaining({ content: "tool not found: read" }));
        await expect(hitlAgent.execute(createToolCall("write")))
            .resolves.toEqual(expect.objectContaining({ content: "Tool execution denied by user." }));
        await expect(noHitlAgent.execute(createToolCall("write")))
            .resolves.toEqual(expect.objectContaining({ content: "tool not found: write" }));
    });

    it("sanitizes omitted optional fields in default blueprint configs", () => {
        const blueprint = createDefaultBlueprint({
            engines: ["openai"],
            persistence: {
                rootDir: testDir,
                fileName: "messages.jsonl",
            },
            mcp: {
                servers: {},
                capabilities: undefined,
            } as unknown as DefaultBlueprintOptions["mcp"],
            skill: {
                directories: [testDir],
                capabilities: undefined,
            } as unknown as DefaultBlueprintOptions["skill"],
            subagent: {
                path: testDir,
                capabilities: undefined,
            } as unknown as DefaultBlueprintOptions["subagent"],
            systemPrompt: {
                prompt: "Use the workspace.",
                baseDir: undefined,
            } as unknown as DefaultBlueprintOptions["systemPrompt"],
        });

        const parsed = AgentBlueprintSchema.parse(blueprint);

        expect(parsed.mcp?.config).toEqual({ servers: {} });
        expect(parsed.skill?.config).toEqual({ directories: [testDir] });
        expect(parsed.subagent?.config).toEqual({ path: testDir });
        expect(parsed.context?.find((item) => item.use === "system-prompt")?.config)
            .toEqual({ prompt: "Use the workspace." });
    });

    it("uses the live agent model runtime for summary compression", async () => {
        const manager = new BlueprintManager();
        const config = createConfig(testDir);
        const seenProviderKeys: string[] = [];
        const compressors: CompressorProbe[] = [];

        registerBuiltinBlueprintImpls(manager, {
            subagentFactory: createSubagentFactory(),
            onCompressor: (compressor) => {
                compressors.push(compressor);
            },
        });
        manager.registerEngineImpl("test", {
            configSchema: z.strictObject({}),
            create: () => createTestEngine((request) => {
                seenProviderKeys.push(request.runtime.key);
            }),
        });

        const agent = await manager.assemble({
            blueprint: {
                engines: [{ use: "test" }],
                compression: {
                    use: "summary",
                    config: { maxMessages: 3, keepRecent: 1 },
                },
            },
            config,
        });

        agent.setModel({
            provider: "test",
            key: "updated-key",
            model: { name: "test-model", thinkingLevels: [ThinkingLevel.None] },
        });
        expect(compressors).toHaveLength(1);
        const compressor = compressors[0]!;
        compressor.updateMessages(createMessages(4));
        await compressor.maybeCompress();

        expect(seenProviderKeys).toEqual(["updated-key"]);
        expect(compressor.getSummary()).toBe("summary");
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { AgentAssembler, AgentBlueprintRegistry } from "./assembler.js";
import { LLMStreamChunkType, MessageType, type LLMRequest, type Message, type MessageChunk } from "../core/types.js";
import { ThinkingLevel, type AgentConfig, type LLMGenerateRequest, type ResolvedModel } from "../core/config.js";
import { isCapabilityEnabled } from "./capability.js";
import type { AgentCapabilitySelector } from "./capability.js";

function createConfig(basepersistdir: string): AgentConfig {
    return {
        providers: [{
            provider: "test",
            key: "test-key",
            models: [{ id: "test-model", name: "test-model" }],
        }],
        plugins: new Map(),
        paths: { sessiondir: basepersistdir },
    };
}

function resolvedModel(): ResolvedModel {
    return {
        id: "test-model",
        provider: "test",
        name: "test-model",
        thinkingLevels: [ThinkingLevel.None],
    };
}

function textChunk(text: string): MessageChunk {
    return {
        type: LLMStreamChunkType.TextDelta,
        text,
    };
}

function createLLM(): LLMRequest {
    return {
        getEngineModels(engineName: string): ResolvedModel[] {
            return engineName === "test" ? [resolvedModel()] : [];
        },
        async *streamInvoke(_request: LLMGenerateRequest): AsyncGenerator<MessageChunk> {
            yield textChunk("done");
        },
    };
}

describe("AgentAssembler", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), "miniagent-assembler-test-"));
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it("filters static tools by name and forwards capability selectors to capability consumers", async () => {
        const registry = new AgentBlueprintRegistry();
        const capabilityConsumerSpy = vi.fn();

        registry.register("tool.echo", () => ({
            name: "echo",
            description: "echo",
            parameters: z.object({
                text: z.string(),
            }),
            execute: async (args: Record<string, unknown>): Promise<string> => String(args["text"]),
            consumeAgentCapabilities: async (capabilities: AgentCapabilitySelector): Promise<boolean> => {
                return isCapabilityEnabled("echo", capabilities.tool);
            },
        }));

        registry.register("context.consumer", () => ({
            priority: 0,
            consumeAgentCapabilities: async (capabilities: { tool?: { allow?: string[]; deny?: string[] } }): Promise<boolean> => {
                capabilityConsumerSpy(capabilities);
                return true;
            },
            collect: async (): Promise<Message[]> => [{
                id: "consumer-1",
                type: MessageType.System,
                content: "consumer",
            }],
        }));

        const assembler = new AgentAssembler(registry);
        const agent = await assembler.assemble({
            llm: createLLM(),
            config: createConfig(testDir),
            blueprint: {
                uses: ["tool.echo", "context.consumer"],
            },
            capabilities: {
                tool: {
                    deny: ["echo"],
                },
            },
        });
 
        const tools = await agent.getToolList();
        const context = await agent.previewContext();

        expect(tools).toEqual([]);
        expect(context.map((message) => message.id)).toEqual(["consumer-1"]);
        expect(capabilityConsumerSpy).toHaveBeenCalledWith({
            tool: {
                deny: ["echo"],
            },
        });
    });

    it("throws when the blueprint references an unknown use id", async () => {
        const assembler = new AgentAssembler(new AgentBlueprintRegistry());

        await expect(assembler.assemble({
            llm: createLLM(),
            config: createConfig(testDir),
            blueprint: {
                uses: ["missing.use"],
            },
        })).rejects.toThrow("Unknown blueprint use: missing.use");
    });
});

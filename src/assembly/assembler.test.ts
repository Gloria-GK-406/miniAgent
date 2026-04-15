import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { AgentAssembler, AgentBlueprintRegistry } from "./assembler.js";
import { MessageType } from "../core/types.js";
import type { AgentConfig } from "../core/config.js";
import type { LLMRequest, LLMResponse, LLMStreamHandle, Message } from "../core/types.js";
import { isCapabilityEnabled } from "./capability.js";
import type { AgentCapabilitySelector } from "./capability.js";

function createConfig(basepersistdir: string): AgentConfig {
    return {
        model: {
            provider: "test",
            model: "test-model",
            apiKey: "test-key",
        },
        models: new Map(),
        plugins: new Map(),
        paths: { sessiondir: basepersistdir },
    };
}

function createResolvedHandle<T>(value: T): LLMStreamHandle<T> {
    return {
        onChunk: () => () => void 0,
        then<TResult1 = T, TResult2 = never>(
            onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): PromiseLike<TResult1 | TResult2> {
            return Promise.resolve(value).then(onfulfilled, onrejected);
        },
    };
}

function createLLM(): LLMRequest {
    const response: LLMResponse = {
        message: {
            id: "assist-1",
            type: MessageType.Assist,
            content: "done",
        },
        tokenCount: {
            input: 0,
            output: 0,
            total: 0,
        },
    };

    return {
        streamInvoke(_messages: Message[]): LLMStreamHandle<LLMResponse> {
            return createResolvedHandle(response);
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

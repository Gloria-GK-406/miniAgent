import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { AgentAssembler, AgentBlueprintRegistry } from "./assembler.js";
import { MessageType } from "./types.js";
import type { AgentConfig } from "./config.js";
import type { LLMRequest, LLMResponse, LLMStreamHandle, Message } from "./types.js";

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

    it("filters static tools by name and forwards capability selectors to aware uses", async () => {
        const registry = new AgentBlueprintRegistry();
        const awareSpy = vi.fn();

        registry.register("tool.echo", () => ({
            name: "echo",
            description: "echo",
            parameters: z.object({
                text: z.string(),
            }),
            execute: async (args: Record<string, unknown>): Promise<string> => String(args["text"]),
        }));

        registry.register("context.aware", () => ({
            priority: 0,
            setAgentCapabilities: async (capabilities: { tool?: { allow?: string[]; deny?: string[] } }): Promise<void> => {
                awareSpy(capabilities);
            },
            collect: async (): Promise<Message[]> => [{
                id: "aware-1",
                type: MessageType.System,
                content: "aware",
            }],
        }));

        const assembler = new AgentAssembler(registry);
        const agent = await assembler.assemble({
            llm: createLLM(),
            config: createConfig(testDir),
            blueprint: {
                uses: ["tool.echo", "context.aware"],
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
        expect(context.map((message) => message.id)).toEqual(["aware-1"]);
        expect(awareSpy).toHaveBeenCalledWith({
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

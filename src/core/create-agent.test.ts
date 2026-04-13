import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { createMiniAgent } from "./create-agent.js";
import { defineAgentModule } from "./module.js";
import { MessageType } from "./types.js";
import type { AgentConfig } from "./config.js";
import type { LLMMessageResponse, LLMRequest, LLMResponse, LLMStreamHandle, Message } from "./types.js";
import type { Store } from "../store/store.js";
import type { MessageSource } from "../store/message-source.js";

function createConfig(basepersistdir: string): AgentConfig {
    return {
        model: {
            provider: "test",
            model: "test-model",
            apiKey: "test-key",
            baseUrl: "http://localhost",
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

function wrapResponse(message: LLMMessageResponse): LLMResponse {
    return {
        message,
        tokenCount: {
            input: 0,
            output: 0,
            total: 0,
        },
    };
}

function createLLM(response: LLMResponse, onInvoke?: (messages: Message[]) => void): LLMRequest {
    return {
        streamInvoke(messages: Message[]): LLMStreamHandle<LLMResponse> {
            onInvoke?.(messages);
            return createResolvedHandle(response);
        },
    };
}

describe("createMiniAgent", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), "miniagent-create-agent-test-"));
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it("installs modules and installers through the use option", async () => {
        const installed = vi.fn();
        const seenContexts: Message[][] = [];
        const llm = createLLM(
            wrapResponse({
                id: "assist-1",
                type: MessageType.Assist,
                content: "done",
            }),
            (messages) => {
                seenContexts.push(messages);
            },
        );

        const agent = createMiniAgent({
            llm,
            config: createConfig(testDir),
            use: [
                {
                    name: "echo",
                    description: "Echoes text",
                    parameters: z.object({
                        text: z.string(),
                    }),
                    execute: async (args: Record<string, unknown>): Promise<string> => String(args["text"]),
                },
                defineAgentModule({
                    priority: 0,
                    collect: async (): Promise<Message[]> => [
                        {
                            id: "system-1",
                            type: MessageType.System,
                            content: "system",
                        },
                    ],
                }),
                (createdAgent) => {
                    installed(createdAgent);
                },
            ],
        });

        await agent.run({
            id: "user-1",
            type: MessageType.User,
            content: "hello",
        });

        expect(installed).toHaveBeenCalledOnce();
        expect(seenContexts[0]!.map((message) => message.id)).toEqual(["system-1", "user-1"]);
    });

    it("supports multi-role modules through defineAgentModule", async () => {
        const llm = createLLM(wrapResponse({
            id: "assist-1",
            type: MessageType.Assist,
            content: "done",
        }));

        const agent = createMiniAgent({
            llm,
            config: createConfig(testDir),
            use: [
                defineAgentModule({
                    priority: 0,
                    collect: async (): Promise<Message[]> => [
                        {
                            id: "provider-1",
                            type: MessageType.System,
                            content: "provided",
                        },
                    ],
                    appendTurnContext: async (): Promise<Message[]> => [
                        {
                            id: "append-1",
                            type: MessageType.System,
                            content: "prepended",
                        },
                    ],
                }),
            ],
        });

        const preview = await agent.previewContext();
        expect(preview.map((message) => message.id)).toEqual(["append-1", "provider-1"]);
    });

    it("accepts store and messageSource during creation", async () => {
        const persisted: Message[] = [];
        const customStore: Store = {
            readFile: async () => "",
            writeFile: async () => {},
            writeJsonTo: async () => {},
            readJsonFrom: async () => ({}),
            appendFile: async () => {},
        };
        const customMessageSource: MessageSource = {
            add: async (message: Message): Promise<void> => {
                persisted.push(message);
            },
            append: async (messages: Message[]): Promise<void> => {
                persisted.push(...messages);
            },
            setDiscardBefore: async (): Promise<void> => {},
            clearDiscardBefore: async (): Promise<void> => {},
            get: async (id: string): Promise<Message | undefined> => persisted.find((message) => message.id === id),
            getAll: async (): Promise<Message[]> => [...persisted],
        };
        const receivedStores: Store[] = [];
        const llm = createLLM(wrapResponse({
            id: "assist-1",
            type: MessageType.Assist,
            content: "done",
        }));

        const agent = createMiniAgent({
            llm,
            config: createConfig(testDir),
            store: customStore,
            messageSource: customMessageSource,
            use: [
                {
                    setStore: async (store: Store): Promise<void> => {
                        receivedStores.push(store);
                    },
                },
            ],
        });

        await agent.run({
            id: "user-1",
            type: MessageType.User,
            content: "hello",
        });

        expect(receivedStores).toEqual([customStore]);
        expect((await agent.getMessages()).map((message) => message.id)).toEqual(["user-1", "assist-1"]);
    });
});

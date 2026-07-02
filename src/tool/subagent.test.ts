import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MessageType } from "../core/types.js";
import {
    SubAgentProvider,
    SubagentPlugin,
    type AgentFactory,
    type ConfiguredSubagentFactory,
    type SubagentInvocation,
} from "./subagent.js";

function makeManifest(
    lines: string[],
    prompt = "You are a specialized subagent.",
): string {
    return [
        "---",
        ...lines,
        "---",
        prompt,
    ].join("\n");
}

describe("SubagentPlugin", () => {
    let testDir: string;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), "subagent-plugin-test-"));
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it("accepts an empty config and applies schema defaults", () => {
        expect(() => new SubagentPlugin({}, async () => {
            throw new Error("not used");
        })).not.toThrow();
    });

    it("lists valid markdown subagents from the configured path", async () => {
        const subagentDir = join(testDir, "agents");
        await mkdir(subagentDir);
        await writeFile(
            join(subagentDir, "reviewer.md"),
            makeManifest([
                "id: reviewer",
                "name: Reviewer",
                "description: Reviews code changes",
            ]),
            "utf-8",
        );
        await writeFile(
            join(subagentDir, "invalid.md"),
            makeManifest([
                "name: Missing Id",
            ]),
            "utf-8",
        );

        const plugin = new SubagentPlugin({ path: subagentDir }, async () => {
            throw new Error("not used");
        });
        await plugin.initialize();

        const messages = await plugin.collect();
        expect(messages).toHaveLength(1);
        expect(messages[0]!.content).toContain("reviewer");
        expect(messages[0]!.content).not.toContain("Missing Id");
    });

    it("runs a configured subagent and returns the final assistant message", async () => {
        const subagentDir = join(testDir, "agents");
        await mkdir(subagentDir);
        await writeFile(
            join(subagentDir, "reviewer.md"),
            [
                "---",
                "id: reviewer",
                "name: Reviewer",
                "description: Reviews code changes",
                "model: test/child-model",
                "capabilities:",
                "  tool:",
                "    allow:",
                "      - read",
                "      - glob",
                "  skill:",
                "    allow:",
                "      - review",
                "---",
                "You are a strict code reviewer.",
            ].join("\n"),
            "utf-8",
        );

        const destroy = vi.fn(async () => {});
        const factory = vi.fn(async (request: SubagentInvocation) => ({
            run: vi.fn(async () => ([
                {
                    id: "assist-1",
                    type: MessageType.Assist,
                    content: `Handled: ${request.task}`,
                },
            ])),
            destroy,
        })) as ConfiguredSubagentFactory;

        const plugin = new SubagentPlugin({ path: subagentDir }, factory);
        await plugin.initialize();

        const tools = await plugin.getTools();
        const result = await tools[0]!.execute({
            agent: "reviewer",
            task: "Review the latest patch",
            context: "Changed files: src/a.ts",
        });

        expect(factory).toHaveBeenCalledWith({
            entry: expect.objectContaining({
                id: "reviewer",
                name: "Reviewer",
                model: "test/child-model",
                capabilities: {
                    tool: {
                        allow: ["read", "glob"],
                    },
                    skill: {
                        allow: ["review"],
                    },
                },
                prompt: "You are a strict code reviewer.",
            }),
            task: "Review the latest patch",
            context: "Changed files: src/a.ts",
        });
        expect(result).toContain("<subagent_result");
        expect(result).toContain("Handled: Review the latest patch");
        expect(destroy).toHaveBeenCalledOnce();
    });

    it("parses JSON5 frontmatter manifests", async () => {
        const subagentDir = join(testDir, "agents");
        await mkdir(subagentDir);
        await writeFile(
            join(subagentDir, "planner.md"),
            [
                "---",
                "{",
                "  id: 'planner',",
                "  name: 'Planner',",
                "  capabilities: {",
                "    tool: { allow: ['read'] },",
                "  },",
                "}",
                "---",
                "You are a planner.",
            ].join("\n"),
            "utf-8",
        );

        const plugin = new SubagentPlugin({ path: subagentDir }, async () => {
            throw new Error("not used");
        });
        await plugin.initialize();

        const messages = await plugin.collect();
        expect(messages[0]!.content).toContain("planner");
        expect(messages[0]!.content).toContain("Planner");
    });

    it("filters visible subagents through the subagent capability selector", async () => {
        const subagentDir = join(testDir, "agents");
        await mkdir(subagentDir);
        await writeFile(
            join(subagentDir, "reviewer.md"),
            makeManifest(["id: reviewer"]),
            "utf-8",
        );
        await writeFile(
            join(subagentDir, "planner.md"),
            makeManifest(["id: planner"]),
            "utf-8",
        );

        const plugin = new SubagentPlugin({
            path: subagentDir,
            capabilities: {
                allow: ["reviewer"],
            },
        }, async () => {
            throw new Error("not used");
        });
        await plugin.initialize();

        const messages = await plugin.collect();
        expect(messages[0]!.content).toContain("reviewer");
        expect(messages[0]!.content).not.toContain("planner");
    });

    it("does not run a configured subagent when the signal is already aborted", async () => {
        const subagentDir = join(testDir, "agents");
        await mkdir(subagentDir);
        await writeFile(
            join(subagentDir, "reviewer.md"),
            makeManifest(["id: reviewer", "name: Reviewer"]),
            "utf-8",
        );

        const factory = vi.fn(async () => {
            throw new Error("factory should not be called");
        }) as unknown as ConfiguredSubagentFactory;
        const plugin = new SubagentPlugin({ path: subagentDir }, factory);
        await plugin.initialize();

        const controller = new AbortController();
        controller.abort();
        const tools = await plugin.getTools();
        const result = await tools[0]!.execute({
            agent: "reviewer",
            task: "Review this",
        }, controller.signal);

        expect(factory).not.toHaveBeenCalled();
        expect(result).toContain("aborted");
    });

    it("removes configured subagent abort listener when run rejects", async () => {
        const subagentDir = join(testDir, "agents");
        await mkdir(subagentDir);
        await writeFile(
            join(subagentDir, "reviewer.md"),
            makeManifest(["id: reviewer", "name: Reviewer"]),
            "utf-8",
        );

        const run = vi.fn(async () => {
            throw new Error("run failed");
        });
        const stop = vi.fn();
        const destroy = vi.fn(async () => {});
        const factory = vi.fn(async () => ({ run, stop, destroy })) as unknown as ConfiguredSubagentFactory;
        const plugin = new SubagentPlugin({ path: subagentDir }, factory);
        await plugin.initialize();

        const controller = new AbortController();
        const removeSpy = vi.spyOn(controller.signal, "removeEventListener");
        const tools = await plugin.getTools();

        await expect(tools[0]!.execute({
            agent: "reviewer",
            task: "Review this",
        }, controller.signal)).rejects.toThrow("run failed");

        expect(removeSpy).toHaveBeenCalledOnce();
        expect(destroy).toHaveBeenCalledOnce();
    });

    it("destroys a configured subagent when aborted after creation", async () => {
        const subagentDir = join(testDir, "agents");
        await mkdir(subagentDir);
        await writeFile(
            join(subagentDir, "reviewer.md"),
            makeManifest(["id: reviewer", "name: Reviewer"]),
            "utf-8",
        );

        const controller = new AbortController();
        const run = vi.fn(async () => []);
        const stop = vi.fn();
        const destroy = vi.fn(async () => {});
        const factory = vi.fn(async () => {
            controller.abort();
            return { run, stop, destroy };
        }) as unknown as ConfiguredSubagentFactory;
        const plugin = new SubagentPlugin({ path: subagentDir }, factory);
        await plugin.initialize();
        const tools = await plugin.getTools();

        const result = await tools[0]!.execute({
            agent: "reviewer",
            task: "Review this",
        }, controller.signal);

        expect(result).toContain("aborted");
        expect(run).not.toHaveBeenCalled();
        expect(stop).toHaveBeenCalledOnce();
        expect(destroy).toHaveBeenCalledOnce();
    });
});

describe("SubAgentProvider", () => {
    it("destroys spawned subagents after successful runs", async () => {
        const destroy = vi.fn(async () => {});
        const factory = vi.fn(async () => ({
            run: vi.fn(async () => ([
                {
                    id: "assist-1",
                    type: MessageType.Assist,
                    content: "done",
                },
            ])),
            destroy,
        })) as unknown as AgentFactory;
        const provider = new SubAgentProvider(factory);
        const tools = await provider.getTools();

        const result = await tools[0]!.execute({ task: "Do work" });

        expect(result).toBe("done");
        expect(destroy).toHaveBeenCalledOnce();
    });

    it("does not run a subagent when the signal is already aborted", async () => {
        const factory = vi.fn(async () => {
            throw new Error("factory should not be called");
        }) as unknown as AgentFactory;
        const provider = new SubAgentProvider(factory);
        const tools = await provider.getTools();

        const controller = new AbortController();
        controller.abort();
        const result = await tools[0]!.execute({ task: "Do work" }, controller.signal);

        expect(factory).not.toHaveBeenCalled();
        expect(result).toContain("aborted");
    });

    it("removes abort listener when subagent run rejects", async () => {
        const run = vi.fn(async () => {
            throw new Error("run failed");
        });
        const stop = vi.fn();
        const destroy = vi.fn(async () => {});
        const factory = vi.fn(async () => ({ run, stop, destroy })) as unknown as AgentFactory;
        const provider = new SubAgentProvider(factory);
        const tools = await provider.getTools();

        const controller = new AbortController();
        const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

        await expect(tools[0]!.execute({ task: "Do work" }, controller.signal))
            .rejects.toThrow("run failed");

        expect(removeSpy).toHaveBeenCalledOnce();
        expect(destroy).toHaveBeenCalledOnce();
    });
});

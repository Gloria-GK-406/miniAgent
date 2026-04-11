import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MessageType } from "../core/types.js";
import type { AgentConfig } from "../core/config.js";
import { SubagentPlugin } from "./subagent.js";

function makeConfig(path: string): AgentConfig {
    return {
        model: { provider: "test", model: "m", apiKey: "k" },
        models: new Map(),
        plugins: new Map([["subagent", { path }]]),
        paths: { sessiondir: "/tmp" },
    };
}

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

        const plugin = new SubagentPlugin(async () => {
            throw new Error("not used");
        });
        await plugin.setConfig(makeConfig(subagentDir));

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

        const factory = vi.fn(async (request) => ({
            run: vi.fn(async () => ([
                {
                    id: "assist-1",
                    type: MessageType.Assist,
                    content: `Handled: ${request.task}`,
                },
            ])),
        })) as Parameters<typeof SubagentPlugin>[0];

        const plugin = new SubagentPlugin(factory);
        await plugin.setConfig(makeConfig(subagentDir));

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

        const plugin = new SubagentPlugin(async () => {
            throw new Error("not used");
        });
        await plugin.setConfig(makeConfig(subagentDir));

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

        const plugin = new SubagentPlugin(async () => {
            throw new Error("not used");
        });
        await plugin.setAgentCapabilities({
            subagent: {
                allow: ["reviewer"],
            },
        });
        await plugin.setConfig(makeConfig(subagentDir));

        const messages = await plugin.collect();
        expect(messages[0]!.content).toContain("reviewer");
        expect(messages[0]!.content).not.toContain("planner");
    });
});

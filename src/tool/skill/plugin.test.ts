import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SkillPlugin } from "./plugin.js";
import { AgentConfigSchema, type JsonValue, type NormalizedAgentConfig } from "../../core/config.js";
import { MessageType } from "../../core/types.js";

function makeAgentConfig(plugins = new Map<string, JsonValue>()): NormalizedAgentConfig {
    return AgentConfigSchema.parse({
        providers: [{ provider: "test", key: "key" }],
        plugins,
        paths: { sessiondir: "/tmp" },
    });
}

function makeConfig(directories: string[]): NormalizedAgentConfig {
    return makeAgentConfig(new Map([["skill", { directories }]]));
}

function makeSkillManifest(id: string, name?: string, description?: string, content?: string): string {
    const lines = ["---"];
    lines.push(`id: ${id}`);
    if (name) lines.push(`name: ${name}`);
    if (description) lines.push(`description: ${description}`);
    lines.push("---");
    if (content) lines.push(content);
    return lines.join("\n");
}

describe("SkillPlugin", () => {
    let testDir: string;
    let plugin: SkillPlugin;

    beforeEach(async () => {
        testDir = await mkdtemp(join(tmpdir(), "skill-test-"));
        plugin = new SkillPlugin();
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    describe("setConfig", () => {
        it("clears skills when no config", async () => {
            const config = makeAgentConfig();
            await plugin.setConfig(config);
            const tools = await plugin.getTools();
            expect(tools).toEqual([]);
        });

        it("clears skills when config is null", async () => {
            const config = makeAgentConfig(new Map([["skill", null]]));
            await plugin.setConfig(config);
            const tools = await plugin.getTools();
            expect(tools).toEqual([]);
        });

        it("throws on invalid config", async () => {
            const config = makeAgentConfig(new Map([["skill", { directories: 123 }]]));
            await expect(plugin.setConfig(config)).rejects.toThrow("Invalid skill plugin config");
        });

        it("scans directories and loads skills", async () => {
            const skillDir = join(testDir, "my-skill");
            await mkdir(skillDir);
            await writeFile(
                join(skillDir, "SKILL.md"),
                makeSkillManifest("my-skill", "My Skill", "A test skill", "Skill content here"),
                "utf-8",
            );

            await plugin.setConfig(makeConfig([testDir]));
            const messages = await plugin.collect();
            expect(messages).toHaveLength(1);
            expect(messages[0]!.type).toBe(MessageType.System);
            expect(messages[0]!.content).toContain("my-skill");
            expect(messages[0]!.content).toContain("My Skill");
            expect(messages[0]!.content).toContain("A test skill");
        });
    });

    describe("collect", () => {
        it("returns empty array when no skills loaded", async () => {
            const config = makeAgentConfig();
            await plugin.setConfig(config);
            const messages = await plugin.collect();
            expect(messages).toEqual([]);
        });

        it("includes load_skill hint in message", async () => {
            const skillDir = join(testDir, "hint-skill");
            await mkdir(skillDir);
            await writeFile(
                join(skillDir, "SKILL.md"),
                makeSkillManifest("hint-skill", "Hint", "Desc"),
                "utf-8",
            );

            await plugin.setConfig(makeConfig([testDir]));
            const messages = await plugin.collect();
            expect(messages[0]!.content).toContain("load_skill");
        });
    });

    describe("getTools", () => {
        it("returns empty array when no skills", async () => {
            const config = makeAgentConfig();
            await plugin.setConfig(config);
            const tools = await plugin.getTools();
            expect(tools).toEqual([]);
        });

        it("returns load_skill tool when skills exist", async () => {
            const skillDir = join(testDir, "tool-skill");
            await mkdir(skillDir);
            await writeFile(
                join(skillDir, "SKILL.md"),
                makeSkillManifest("tool-skill", "Tool Skill", "Desc", "Tool content"),
                "utf-8",
            );

            await plugin.setConfig(makeConfig([testDir]));
            const tools = await plugin.getTools();
            expect(tools).toHaveLength(1);
            expect(tools[0]!.name).toBe("load_skill");
        });

        it("load_skill execute returns skill content", async () => {
            const skillDir = join(testDir, "exec-skill");
            await mkdir(skillDir);
            await writeFile(
                join(skillDir, "SKILL.md"),
                makeSkillManifest("exec-skill", "Exec", "Desc", "Detailed instructions"),
                "utf-8",
            );

            await plugin.setConfig(makeConfig([testDir]));
            const tools = await plugin.getTools();
            const result = await tools[0]!.execute({ id: "exec-skill" });
            expect(result).toContain("Detailed instructions");
        });

        it("load_skill execute returns error for unknown skill", async () => {
            const skillDir = join(testDir, "known-skill");
            await mkdir(skillDir);
            await writeFile(
                join(skillDir, "SKILL.md"),
                makeSkillManifest("known-skill", "Known", "Desc"),
                "utf-8",
            );

            await plugin.setConfig(makeConfig([testDir]));
            const tools = await plugin.getTools();
            const result = await tools[0]!.execute({ id: "unknown-skill" });
            expect(result).toContain("unknown-skill");
            expect(result).toContain("not found");
        });

        it("load_skill execute lists skill files", async () => {
            const skillDir = join(testDir, "file-skill");
            await mkdir(skillDir);
            await writeFile(
                join(skillDir, "SKILL.md"),
                makeSkillManifest("file-skill", "File", "Desc", "Content"),
                "utf-8",
            );
            await writeFile(join(skillDir, "helper.ts"), "export const x = 1;", "utf-8");

            await plugin.setConfig(makeConfig([testDir]));
            const tools = await plugin.getTools();
            const result = await tools[0]!.execute({ id: "file-skill" });
            expect(result).toContain("<skill_files>");
            expect(result).toContain("helper.ts");
        });

        it("filters visible skills by capability selector", async () => {
            const skillADir = join(testDir, "skill-a");
            await mkdir(skillADir);
            await writeFile(
                join(skillADir, "SKILL.md"),
                makeSkillManifest("skill-a", "Skill A", "Desc A", "A"),
                "utf-8",
            );

            const skillBDir = join(testDir, "skill-b");
            await mkdir(skillBDir);
            await writeFile(
                join(skillBDir, "SKILL.md"),
                makeSkillManifest("skill-b", "Skill B", "Desc B", "B"),
                "utf-8",
            );

            await plugin.consumeAgentCapabilities({
                skill: {
                    allow: ["skill-a"],
                },
            });
            await plugin.setConfig(makeConfig([testDir]));

            const messages = await plugin.collect();
            expect(messages[0]!.content).toContain("skill-a");
            expect(messages[0]!.content).not.toContain("skill-b");

            const tools = await plugin.getTools();
            const result = await tools[0]!.execute({ id: "skill-b" });
            expect(result).toContain("Skill \"skill-b\" not found");
            expect(result).toContain("skill-a");
        });
    });

    describe("skill manifest parsing", () => {
        it("skips directories without SKILL.md", async () => {
            const emptyDir = join(testDir, "no-manifest");
            await mkdir(emptyDir);

            await plugin.setConfig(makeConfig([testDir]));
            const tools = await plugin.getTools();
            expect(tools).toEqual([]);
        });

        it("skips manifest without valid id", async () => {
            const noIdDir = join(testDir, "no-id");
            await mkdir(noIdDir);
            await writeFile(
                join(noIdDir, "SKILL.md"),
                "---\nname: NoId\n---\nContent",
                "utf-8",
            );

            await plugin.setConfig(makeConfig([testDir]));
            const tools = await plugin.getTools();
            expect(tools).toEqual([]);
        });

        it("uses id as name when name not provided", async () => {
            const skillDir = join(testDir, "noname");
            await mkdir(skillDir);
            await writeFile(
                join(skillDir, "SKILL.md"),
                makeSkillManifest("noname", undefined, undefined, "Content"),
                "utf-8",
            );

            await plugin.setConfig(makeConfig([testDir]));
            const messages = await plugin.collect();
            expect(messages[0]!.content).toContain("name: noname");
        });

        it("uses empty description when not provided", async () => {
            const skillDir = join(testDir, "nodesc");
            await mkdir(skillDir);
            await writeFile(
                join(skillDir, "SKILL.md"),
                makeSkillManifest("nodesc", "Name", undefined, "Content"),
                "utf-8",
            );

            await plugin.setConfig(makeConfig([testDir]));
            const messages = await plugin.collect();
            expect(messages[0]!.content).toContain("description: ");
        });

        it("handles manifest without frontmatter", async () => {
            const skillDir = join(testDir, "nofm");
            await mkdir(skillDir);
            await writeFile(
                join(skillDir, "SKILL.md"),
                "Just plain content without frontmatter",
                "utf-8",
            );

            await plugin.setConfig(makeConfig([testDir]));
            const tools = await plugin.getTools();
            expect(tools).toEqual([]);
        });
    });

    describe("multiple directories", () => {
        it("scans multiple directories", async () => {
            const dir1 = join(testDir, "dir1");
            const dir2 = join(testDir, "dir2");
            await mkdir(dir1);
            await mkdir(dir2);

            const skill1 = join(dir1, "skill-a");
            await mkdir(skill1);
            await writeFile(
                join(skill1, "SKILL.md"),
                makeSkillManifest("skill-a", "A", "Skill A"),
                "utf-8",
            );

            const skill2 = join(dir2, "skill-b");
            await mkdir(skill2);
            await writeFile(
                join(skill2, "SKILL.md"),
                makeSkillManifest("skill-b", "B", "Skill B"),
                "utf-8",
            );

            await plugin.setConfig(makeConfig([dir1, dir2]));
            const messages = await plugin.collect();
            expect(messages[0]!.content).toContain("skill-a");
            expect(messages[0]!.content).toContain("skill-b");
        });
    });

    describe("config change", () => {
        it("reloads skills when config changes", async () => {
            const skillDir = join(testDir, "change-skill");
            await mkdir(skillDir);
            await writeFile(
                join(skillDir, "SKILL.md"),
                makeSkillManifest("change-skill", "Change", "Desc"),
                "utf-8",
            );

            await plugin.setConfig(makeConfig([testDir]));
            let tools = await plugin.getTools();
            expect(tools).toHaveLength(1);

            await plugin.setConfig(makeConfig(["/nonexistent"]));
            tools = await plugin.getTools();
            expect(tools).toEqual([]);
        });
    });
});

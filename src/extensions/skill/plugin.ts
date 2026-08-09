import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Tool } from "../../core/index.js";
import { MessageType } from "../../core/index.js";
import type { Message } from "../../core/index.js";
import { isCapabilityEnabled } from "../../core/index.js";
import { parseFrontmatter } from "../frontmatter.js";
import { SkillPluginConfigSchema } from "./types.js";
import type { SkillCapabilitySelector, SkillPluginConfig, SkillPluginConfigInput, SkillEntry } from "./types.js";

const SKILL_MANIFEST = "SKILL.md";

export class SkillPlugin {
    priority = 100;

    private skills = new Map<string, SkillEntry>();
    private config: SkillPluginConfig;
    private capabilities: SkillCapabilitySelector;

    constructor(config: SkillPluginConfigInput) {
        const parsed = SkillPluginConfigSchema.safeParse(config);
        if (!parsed.success) {
            throw new Error(`Invalid skill plugin config: ${parsed.error.message}`);
        }

        this.config = parsed.data;
        this.capabilities = parsed.data.capabilities ?? {};
    }

    async initialize(): Promise<void> {
        await this.scanAll();
    }

    async collect(): Promise<Message[]> {
        const visibleSkills = this.getVisibleSkills();
        if (visibleSkills.length === 0) return [];

        const lines: string[] = ["<available_skills>"];
        for (const skill of visibleSkills) {
            lines.push(`- id: ${skill["id"]}`);
            lines.push(`  name: ${skill["name"]}`);
            lines.push(`  description: ${skill["description"]}`);
        }
        lines.push("</available_skills>");
        lines.push("");
        lines.push(
            "Use the load_skill tool to retrieve the full instructions and associated files for a skill by its id.",
        );

        return [{
            id: crypto.randomUUID(),
            type: MessageType.System,
            content: lines.join("\n"),
        }];
    }

    async getTools(): Promise<Tool[]> {
        const visibleSkills = this.getVisibleSkills();
        if (visibleSkills.length === 0) return [];

        return [{
            name: "load_skill",
            description:
                "Load the full instructions and file list for a skill by its id. "
                + "Returns the skill content and associated file paths. "
                + "Call this when you need to apply a specific skill's expertise.",
            parameters: z.object({
                id: z.string().describe("The skill id to load"),
            }),
            execute: async (args: Record<string, unknown>, _signal?: AbortSignal): Promise<string> => {
                const id = args["id"] as string;
                const skill = visibleSkills.find((entry) => entry.id === id);
                if (!skill) {
                    const available = visibleSkills.map((entry) => entry.id).join(", ");
                    return `Skill "${id}" not found. Available skills: ${available}`;
                }
                const parts: string[] = [];
                parts.push(skill.content);
                if (skill.files.length > 0) {
                    parts.push("");
                    parts.push("<skill_files>");
                    for (const file of skill.files) {
                        parts.push(file);
                    }
                    parts.push("</skill_files>");
                }
                return parts.join("\n");
            },
        }];
    }

    private getVisibleSkills(): SkillEntry[] {
        return [...this.skills.values()].filter((skill) =>
            isCapabilityEnabled(skill.id, this.capabilities),
        );
    }

    private async scanAll(): Promise<void> {
        this.skills.clear();
        for (const dir of this.config.directories) {
            const expanded = dir.startsWith("~/")
                ? path.join(os.homedir(), dir.slice(2))
                : path.resolve(dir);
            await this.scanDir(expanded);
        }
    }

    private async scanDir(dirPath: string): Promise<void> {
        let entries: string[];
        try {
            entries = await fs.readdir(dirPath);
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry);
            const stat = await fs.stat(fullPath).catch(() => null);
            if (!stat?.isDirectory()) continue;

            const manifestPath = path.join(fullPath, SKILL_MANIFEST);
            const raw = await fs.readFile(manifestPath, "utf-8").catch(() => null);
            if (raw === null) continue;

            const skill = await this.parseManifest(raw, fullPath);
            if (skill) {
                this.skills.set(skill["id"], skill);
            }
        }
    }

    private async parseManifest(raw: string, dirPath: string): Promise<SkillEntry | null> {
        const { data, content } = parseFrontmatter(raw);
        const id = data["id"];
        if (!id || typeof id !== "string") return null;

        const allFiles = await fs.readdir(dirPath).catch(() => []);
        const files = allFiles
            .filter((f) => f !== SKILL_MANIFEST)
            .map((f) => path.join(dirPath, f));

        const name = data["name"];
        const description = data["description"];

        return {
            id,
            name: typeof name === "string" ? name : id,
            description: typeof description === "string" ? description : "",
            content: content.trim(),
            dirPath,
            files,
        };
    }
}

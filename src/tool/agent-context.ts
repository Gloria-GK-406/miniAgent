import { readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { homedir } from "node:os";
import { MessageType } from "../core/types.js";
import type { Message } from "../core/types.js";

const PROJECT_FILES: string[] = [
    "CLAUDE.md",
    "AGENTS.md",
    "GEMINI.md",
    ".github/copilot-instructions.md",
    ".cursorrules",
    ".windsurfrules",
    "CONVENTIONS.md",
    "replit.md",
    ".gemini/styleguide.md",
    ".junie/guidelines.md",
];

const PROJECT_DIRS: Array<{ dir: string; extensions: string[] }> = [
    { dir: ".cursor/rules", extensions: [".mdc", ".md"] },
    { dir: ".amazonq/rules", extensions: [".md"] },
];

const GLOBAL_FILES: string[] = [
    join(homedir(), ".claude", "CLAUDE.md"),
    join(homedir(), ".gemini", "GEMINI.md"),
];

const MAX_FILE_SIZE = 100 * 1024;

function stripFrontmatter(content: string): string {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
    return match ? match[1]!.trim() : content.trim();
}

async function tryReadFile(filePath: string): Promise<string | null> {
    try {
        const content = await readFile(filePath, "utf-8");
        if (content.length > MAX_FILE_SIZE) {
            return content.slice(0, MAX_FILE_SIZE) + "\n... (truncated)";
        }
        return content.trim() || null;
    } catch {
        return null;
    }
}

async function scanDir(
    dirPath: string,
    extensions: string[],
): Promise<Array<{ name: string; content: string }>> {
    let entries: string[];
    try {
        entries = await readdir(dirPath);
    } catch {
        return [];
    }

    const results: Array<{ name: string; content: string }> = [];
    for (const entry of entries) {
        const ext = extname(entry).toLowerCase();
        if (!extensions.includes(ext)) continue;

        const content = await tryReadFile(join(dirPath, entry));
        if (content) {
            results.push({ name: entry, content });
        }
    }
    return results;
}

export class AgentContextProvider {
    priority = 10;
    private baseDir: string;

    constructor(baseDir: string) {
        this.baseDir = baseDir;
    }

    async collect(): Promise<Message[]> {
        const sections: string[] = [];

        for (const relPath of PROJECT_FILES) {
            const content = await tryReadFile(join(this.baseDir, relPath));
            if (content) {
                const processed = relPath.endsWith(".mdc")
                    ? stripFrontmatter(content)
                    : content;
                sections.push(`Instructions from: ${relPath}\n${processed}`);
            }
        }

        for (const dir of PROJECT_DIRS) {
            const dirPath = join(this.baseDir, dir.dir);
            const files = await scanDir(dirPath, dir.extensions);
            for (const file of files) {
                const processed = file.name.endsWith(".mdc")
                    ? stripFrontmatter(file.content)
                    : file.content;
                sections.push(`Instructions from: ${dir.dir}/${file.name}\n${processed}`);
            }
        }

        for (const absPath of GLOBAL_FILES) {
            const content = await tryReadFile(absPath);
            if (content) {
                sections.push(`Instructions from: ${absPath}\n${content}`);
            }
        }

        if (sections.length === 0) return [];

        return [{
            id: crypto.randomUUID(),
            type: MessageType.System,
            content: sections.join("\n\n"),
        }];
    }
}

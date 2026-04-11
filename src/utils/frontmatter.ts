import JSON5 from "json5";
import { parse as parseYaml } from "yaml";

export interface FrontmatterParseResult {
    data: Record<string, unknown>;
    content: string;
}

export function parseFrontmatter(raw: string): FrontmatterParseResult {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
        return { data: {}, content: raw };
    }

    const frontmatter = match[1] ?? "";
    const content = match[2] ?? "";
    return {
        data: parseFrontmatterData(frontmatter),
        content,
    };
}

function parseFrontmatterData(frontmatter: string): Record<string, unknown> {
    const trimmed = frontmatter.trim();
    if (trimmed.length === 0) {
        return {};
    }

    const parsed = looksLikeJson5(trimmed)
        ? parseJson5Record(trimmed)
        : parseYamlRecord(trimmed);

    return parsed ?? {};
}

function looksLikeJson5(value: string): boolean {
    return value.startsWith("{");
}

function parseJson5Record(value: string): Record<string, unknown> | null {
    try {
        const parsed = JSON5.parse(value);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function parseYamlRecord(value: string): Record<string, unknown> | null {
    try {
        const parsed = parseYaml(value);
        return isRecord(parsed) ? parsed : null;
    } catch {
        return parseJson5Record(value);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

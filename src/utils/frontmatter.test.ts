import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter.js";

describe("parseFrontmatter", () => {
    it("returns the full body when no frontmatter exists", () => {
        expect(parseFrontmatter("hello")).toEqual({
            data: {},
            content: "hello",
        });
    });

    it("parses YAML frontmatter", () => {
        const parsed = parseFrontmatter([
            "---",
            "id: reviewer",
            "name: Reviewer",
            "capabilities:",
            "  tool:",
            "    allow:",
            "      - read",
            "      - glob",
            "---",
            "Prompt body",
        ].join("\n"));

        expect(parsed).toEqual({
            data: {
                id: "reviewer",
                name: "Reviewer",
                capabilities: {
                    tool: {
                        allow: ["read", "glob"],
                    },
                },
            },
            content: "Prompt body",
        });
    });

    it("parses JSON5 frontmatter objects", () => {
        const parsed = parseFrontmatter([
            "---",
            "{",
            "  id: 'reviewer',",
            "  capabilities: {",
            "    skill: { allow: ['review'] },",
            "  },",
            "}",
            "---",
            "Prompt body",
        ].join("\n"));

        expect(parsed).toEqual({
            data: {
                id: "reviewer",
                capabilities: {
                    skill: {
                        allow: ["review"],
                    },
                },
            },
            content: "Prompt body",
        });
    });
});

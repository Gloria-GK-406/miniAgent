import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkDependencies } from "../../scripts/check-dependencies.mjs";

const roots: string[] = [];

async function fixture(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "miniagent-architecture-"));
    roots.push(root);
    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = join(root, relativePath);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, "utf8");
    }
    return root;
}

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("architecture boundary policy", () => {
    it("accepts the intended four-layer direction through public entries", async () => {
        const root = await fixture({
            "core/index.ts": "export const core = true;",
            "engine/index.ts": "export { core } from '../core/index.js';",
            "extensions/index.ts": "export { core } from '../core/index.js';",
            "cli/app.ts": "import { core } from '../core/index.js'; export { core };",
        });

        expect(checkDependencies(root)).toEqual([]);
    });

    it.each([
        ["reverse dependency", { "core/index.ts": "export { extension } from '../extensions/index.js';", "extensions/index.ts": "export const extension = true;" }, "forbidden layer dependency"],
        ["sibling dependency", { "core/index.ts": "export const core = true;", "engine/index.ts": "export { extension } from '../extensions/index.js';", "extensions/index.ts": "export const extension = true;" }, "forbidden layer dependency"],
        ["deep cross-layer import", { "core/index.ts": "export const core = true;", "core/private.ts": "export const hidden = true;", "cli/app.ts": "import '../core/private.js';" }, "cross-layer deep import"],
        ["unknown source layer", { "rogue.ts": "export const rogue = true;" }, "unknown source layer"],
        ["core filesystem dependency", { "core/index.ts": "import 'node:fs';" }, "forbidden external dependency"],
        ["type-only cycle", { "core/index.ts": "export type { B } from './b.js';", "core/b.ts": "import type { A } from './a.js'; export type B = A;", "core/a.ts": "import type { B } from './b.js'; export type A = B;" }, "circular dependency"],
    ])("rejects %s", async (_name, files, expected) => {
        const root = await fixture(files);

        expect(checkDependencies(root).some((error) => error.includes(expected))).toBe(true);
    });
});

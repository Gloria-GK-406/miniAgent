import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bashTool } from "./bash.js";

describe("bashTool", () => {
    it("executes a simple command", async () => {
        const result = await bashTool.execute({ command: "echo hello" });
        expect(result).toContain("hello");
    }, 15000);

    it("captures stderr", async () => {
        const result = await bashTool.execute({ command: "echo error >&2" });
        expect(result).toContain("error");
    }, 15000);

    it("reports exit code on failure", async () => {
        const result = await bashTool.execute({ command: "exit 42" });
        expect(result).toContain("Exit code: 42");
    }, 15000);

    it("respects workdir", async () => {
        const workdir = await mkdtemp(join(tmpdir(), "bash-test-"));
        try {
            await writeFile(join(workdir, "marker.txt"), "from-workdir", "utf-8");
            const result = await bashTool.execute({ command: "cat marker.txt", workdir });
            expect(result.trim()).toBe("from-workdir");
        } finally {
            await rm(workdir, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 100,
            });
        }
    }, 15000);

    it("has correct tool metadata", () => {
        expect(bashTool.name).toBe("bash");
        expect(bashTool.description).toBeTruthy();
    });
});

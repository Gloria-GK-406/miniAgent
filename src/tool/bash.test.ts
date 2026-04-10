import { describe, it, expect } from "vitest";
import { bashTool } from "./bash.js";

describe("bashTool", () => {
    it("executes a simple command", async () => {
        const result = await bashTool.execute({ command: "echo hello" });
        expect(result).toContain("hello");
    });

    it("captures stderr", async () => {
        const result = await bashTool.execute({ command: "echo error >&2" });
        expect(result).toContain("error");
    });

    it("reports exit code on failure", async () => {
        const result = await bashTool.execute({ command: "exit 42" });
        expect(result).toContain("Exit code: 42");
    });

    it("respects workdir", async () => {
        const result = await bashTool.execute({ command: "pwd", workdir: "/tmp" });
        expect(result.trim()).toBe("/tmp");
    });

    it("has correct tool metadata", () => {
        expect(bashTool.name).toBe("bash");
        expect(bashTool.description).toBeTruthy();
    });
});

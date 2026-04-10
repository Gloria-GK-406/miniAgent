import { z } from "zod";
import { exec } from "node:child_process";
import type { ExecOptions } from "node:child_process";
import type { Tool } from "./types.js";

const BashParamsSchema = z.object({
    command: z.string().describe("The bash command to execute"),
    timeout: z.number().int().min(1).max(600000).optional().describe("Timeout in milliseconds (max 600000)"),
    workdir: z.string().optional().describe("Working directory for command execution"),
});

function bashExecute(args: Record<string, unknown>): Promise<string> {
    const parsed = BashParamsSchema.parse(args);
    return new Promise((resolve) => {
        const options: ExecOptions = {
            timeout: parsed.timeout ?? 120000,
            maxBuffer: 1024 * 1024 * 10,
        };
        if (parsed.workdir) {
            options.cwd = parsed.workdir;
        }
        exec(parsed.command, options, (error, stdout, stderr) => {
            let output = "";
            if (stdout) output += stdout;
            if (stderr) output += (output ? "\n" : "") + stderr;
            if (error) {
                const code = error.code;
                if (error.killed) {
                    output += (output ? "\n" : "") + `[Process timed out after ${parsed.timeout ?? 120000}ms]`;
                }
                if (typeof code === "number") {
                    output += (output ? "\n" : "") + `[Exit code: ${code}]`;
                }
            }
            resolve(output || "[No output]");
        });
    });
}

export const bashTool: Tool = {
    name: "bash",
    description: "Execute a bash command in a persistent shell session. Returns stdout, stderr, and exit code. Supports timeout and working directory.",
    parameters: BashParamsSchema,
    execute: bashExecute,
};

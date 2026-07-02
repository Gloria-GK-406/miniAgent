import { z } from "zod";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { Tool } from "./types.js";
import { isCapabilityEnabled } from "../assembly/capability.js";
import type { AgentCapabilitySelector } from "../assembly/capability.js";

const BashParamsSchema = z.object({
    command: z.string().describe("The bash command to execute"),
    timeout: z.number().int().min(1).max(600000).optional().describe("Timeout in milliseconds (max 600000)"),
    workdir: z.string().optional().describe("Working directory for command execution"),
});

function bashExecute(args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    const parsed = BashParamsSchema.parse(args);
    const timeout = parsed.timeout ?? 120000;

    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let killed = false;
        let timedOut = false;
        let child: ChildProcess;

        try {
            child = spawn("bash", ["-c", parsed.command], {
                cwd: parsed.workdir,
                env: process.env,
                stdio: ["ignore", "pipe", "pipe"],
                windowsHide: true,
            });
        } catch (e: unknown) {
            resolve(e instanceof Error ? e.message : String(e));
            return;
        }

        const timer = setTimeout(() => {
            timedOut = true;
            killed = true;
            child.kill("SIGKILL");
        }, timeout);

        child.stdout?.on("data", (data: Buffer) => {
            stdout += data.toString();
        });

        child.stderr?.on("data", (data: Buffer) => {
            stderr += data.toString();
        });

        const onAbort = (): void => {
            killed = true;
            child.kill("SIGTERM");
        };

        if (signal) {
            if (signal.aborted) {
                onAbort();
            } else {
                signal.addEventListener("abort", onAbort, { once: true });
            }
        }

        child.on("close", (code: number | null) => {
            clearTimeout(timer);
            if (signal) {
                signal.removeEventListener("abort", onAbort);
            }

            let output = "";
            if (stdout) output += stdout;
            if (stderr) output += (output ? "\n" : "") + stderr;
            if (killed && timedOut) {
                output += (output ? "\n" : "") + `[Process timed out after ${timeout}ms]`;
            } else if (killed) {
                output += (output ? "\n" : "") + "[Process aborted]";
            }
            if (typeof code === "number" && code !== 0 && !killed) {
                output += (output ? "\n" : "") + `[Exit code: ${code}]`;
            }
            resolve(output || "[No output]");
        });

        child.on("error", (err: Error) => {
            clearTimeout(timer);
            if (signal) {
                signal.removeEventListener("abort", onAbort);
            }
            resolve(err.message);
        });
    });
}

export class BashTool implements Tool {
    name = "bash" as const;
    description = "Execute a bash command in a persistent shell session. Returns stdout, stderr, and exit code. Supports timeout and working directory.";
    parameters = BashParamsSchema;
    execute = bashExecute;

    async consumeAgentCapabilities(capabilities: AgentCapabilitySelector): Promise<boolean> {
        return isCapabilityEnabled(this.name, capabilities.tool);
    }
}

export const bashTool: Tool & { consumeAgentCapabilities: (capabilities: AgentCapabilitySelector) => Promise<boolean> } = new BashTool();

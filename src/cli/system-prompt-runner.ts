import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { PrintStreams } from "./print-runner.js";
import { createSystemPromptConfigService } from "./runtime/system-prompt-config-service.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import { readStdin } from "./stdin.js";

export type SystemPromptUpdateAction = "set" | "unset";
export type SystemPromptUpdateOutput = "text" | "json";

export interface SystemPromptUpdateRequest {
  baseDir: string;
  action: SystemPromptUpdateAction;
  prompt?: string;
  promptFile?: string;
  output?: SystemPromptUpdateOutput;
  readStdin?: () => Promise<string>;
}

export interface SystemPromptUpdateResult {
  ok: boolean;
  action: SystemPromptUpdateAction;
  systemPrompt?: string;
}

function resolvePromptFile(baseDir: string, path: string): string {
  return isAbsolute(path) ? path : resolve(baseDir, path);
}

async function readPrompt(request: SystemPromptUpdateRequest): Promise<string> {
  if (request.prompt !== undefined) {
    return request.prompt;
  }
  if (request.promptFile !== undefined) {
    if (request.promptFile === "-") {
      return await (request.readStdin ?? readStdin)();
    }
    return await readFile(resolvePromptFile(request.baseDir, request.promptFile), "utf-8");
  }
  throw new Error("Missing system prompt");
}

export function formatSystemPromptUpdateResultJson(result: SystemPromptUpdateResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function formatSystemPromptUpdateText(result: SystemPromptUpdateResult): string {
  return result.action === "set" ? "Set system prompt\n" : "Unset system prompt\n";
}

export async function runSystemPromptUpdate(
  request: SystemPromptUpdateRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const service = createSystemPromptConfigService(request.baseDir);
    let prompt: string | undefined;
    if (request.action === "set") {
      prompt = (await readPrompt(request)).trim();
      await service.setSystemPrompt(prompt);
    } else {
      await service.unsetSystemPrompt();
    }

    const result = {
      ok: true,
      action: request.action,
      ...(prompt !== undefined && { systemPrompt: prompt }),
    };
    streams.stdout(
      output === "json"
        ? formatSystemPromptUpdateResultJson(result)
        : formatSystemPromptUpdateText(result),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

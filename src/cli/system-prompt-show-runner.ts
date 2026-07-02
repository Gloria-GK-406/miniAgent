import { loadConfig, type CLIAgentMode } from "./config.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";
import {
  buildEffectiveSystemPrompt,
  getBaseSystemPrompt,
} from "./runtime/system-prompt.js";

export type SystemPromptShowOutput = "text" | "json";

export interface SystemPromptShowRequest {
  baseDir: string;
  mode?: CLIAgentMode;
  output?: SystemPromptShowOutput;
}

export interface SystemPromptDisplay {
  ok: boolean;
  mode: CLIAgentMode;
  basePrompt: string;
  effectivePrompt: string;
}

export function formatSystemPromptDisplay(display: SystemPromptDisplay): string {
  return [
    "System Prompt",
    `Mode: ${display.mode}`,
    "",
    "Base:",
    display.basePrompt,
    "",
    "Effective:",
    display.effectivePrompt,
    "",
  ].join("\n");
}

export function formatSystemPromptDisplayJson(display: SystemPromptDisplay): string {
  return `${JSON.stringify(display, null, 2)}\n`;
}

export async function runSystemPromptShow(
  request: SystemPromptShowRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const config = await loadConfig(request.baseDir, { createTemplateIfMissing: false });
    const mode = request.mode ?? config.defaultAgent;
    const basePrompt = getBaseSystemPrompt(config);
    const display = {
      ok: true,
      mode,
      basePrompt,
      effectivePrompt: buildEffectiveSystemPrompt({
        baseDir: request.baseDir,
        mode,
        userSystemPrompt: basePrompt,
      }),
    };
    streams.stdout(
      output === "json"
        ? formatSystemPromptDisplayJson(display)
        : formatSystemPromptDisplay(display),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

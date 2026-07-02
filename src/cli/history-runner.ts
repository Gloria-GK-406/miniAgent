import type { Message, MessageContent } from "../core/types.js";
import type { PrintStreams } from "./print-runner.js";
import type { CLIAppRuntime } from "./runtime/types.js";

export type HistoryOutput = "text" | "json";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatContent(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  if (content.type === "text") {
    return content.text;
  }
  return `[image:${content.mediaType}]`;
}

function formatMessage(message: Message): string {
  return [
    `${message.type} ${message.id}`,
    formatContent(message.content),
  ].join("\n");
}

export function formatHistory(messages: Message[]): string {
  if (messages.length === 0) {
    return "No history messages\n";
  }
  return `${messages.map(formatMessage).join("\n\n")}\n`;
}

export function formatHistoryJson(messages: Message[]): string {
  return `${JSON.stringify({ ok: true, messages }, null, 2)}\n`;
}

export async function runHistory(
  runtime: CLIAppRuntime,
  streams: PrintStreams,
  options: { output?: HistoryOutput } = {},
): Promise<number> {
  try {
    await runtime.runCommand("history", "");
    const panel = runtime.getState().panel;
    if (panel.type !== "history") {
      streams.stderr("History did not produce results\n");
      return 1;
    }
    streams.stdout(
      options.output === "json"
        ? formatHistoryJson(panel.messages)
        : formatHistory(panel.messages),
    );
    return 0;
  } catch (error: unknown) {
    streams.stderr(`${errorMessage(error)}\n`);
    return 1;
  } finally {
    await runtime.destroy();
  }
}

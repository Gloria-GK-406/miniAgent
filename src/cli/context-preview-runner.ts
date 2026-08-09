import type { Message, MessageContent } from "../core/index.js";
import type { PrintStreams } from "./print-runner.js";
import type { CLIAppRuntime } from "./runtime/types.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";

export type ContextPreviewOutput = "text" | "json";

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

export function formatContextPreview(messages: Message[]): string {
  if (messages.length === 0) {
    return "No context messages\n";
  }
  return `${messages.map(formatMessage).join("\n\n")}\n`;
}

export function formatContextPreviewJson(messages: Message[]): string {
  return `${JSON.stringify({ ok: true, messages }, null, 2)}\n`;
}

export async function runContextPreview(
  runtime: CLIAppRuntime,
  streams: PrintStreams,
  options: { output?: ContextPreviewOutput } = {},
): Promise<number> {
  const output = options.output ?? "text";
  try {
    await runtime.runCommand("context", "");
    const panel = runtime.getState().panel;
    if (panel.type !== "context") {
      writeHeadlessError(streams, "Context preview did not produce results", output);
      return 1;
    }
    streams.stdout(
      output === "json"
        ? formatContextPreviewJson(panel.messages)
        : formatContextPreview(panel.messages),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  } finally {
    await runtime.destroy();
  }
}

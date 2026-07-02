import { MessageType, type Message, type MessageContent } from "../core/types.js";
import type { CLIAppRuntime } from "./runtime/types.js";

export interface PrintStreams {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function latestAssistantText(messages: Message[]): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.type === MessageType.Assist) {
      return formatMessageContent(message.content);
    }
  }
  return null;
}

function formatMessageContent(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  if (content.type === "text") {
    return content.text;
  }
  return `[image:${content.mediaType}]`;
}

export async function runPrintPrompt(
  runtime: CLIAppRuntime,
  prompt: string,
  streams: PrintStreams,
): Promise<number> {
  try {
    await runtime.submitInput(prompt);
    const state = runtime.getState();
    if (state.panel.type === "error") {
      streams.stderr(`${state.panel.message}\n`);
      return 1;
    }
    if (state.error !== null) {
      streams.stderr(`${state.error}\n`);
      return 1;
    }

    const text = latestAssistantText(state.messages);
    if (text === null) {
      streams.stderr("No assistant response\n");
      return 1;
    }
    streams.stdout(text.endsWith("\n") ? text : `${text}\n`);
    return 0;
  } catch (error: unknown) {
    streams.stderr(`${errorMessage(error)}\n`);
    return 1;
  } finally {
    await runtime.destroy();
  }
}

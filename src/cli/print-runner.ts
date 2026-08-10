import { z } from "zod";
import { MessageType, type Message, type MessageContent } from "../core/index.js";
import type { CLIAppRuntime } from "./runtime/types.js";

export const PrintStreamsSchema = z.custom<{
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}>();
export type PrintStreams = z.infer<typeof PrintStreamsSchema>;

export const PrintPromptResultSchema = z.object({
  ok: z.boolean(),
  response: z.union([z.string(), z.null()]),
  error: z.union([z.string(), z.null()]),
  sessionId: z.string(),
  modelName: z.string(),
}) as z.ZodType<{
  ok: boolean;
  response: string | null;
  error: string | null;
  sessionId: string;
  modelName: string;
}>;
export type PrintPromptResult = z.infer<typeof PrintPromptResultSchema>;

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

export function formatPrintResultJson(result: PrintPromptResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function denyPendingApprovals(runtime: CLIAppRuntime): () => void {
  const answered = new Set<string>();
  return runtime.subscribe((event) => {
    if (event.type !== "state" || event.state.approval === null) {
      return;
    }
    const { id } = event.state.approval;
    if (answered.has(id)) {
      return;
    }
    answered.add(id);
    runtime.answerApproval(id, "deny");
  });
}

function writePrintError(
  streams: PrintStreams,
  state: ReturnType<CLIAppRuntime["getState"]>,
  message: string,
  output: "text" | "json",
): void {
  if (output === "json") {
    streams.stdout(formatPrintResultJson({
      ok: false,
      response: null,
      error: message,
      sessionId: state.sessionId,
      modelName: state.modelName,
    }));
    return;
  }
  streams.stderr(`${message}\n`);
}

export async function runPrintPrompt(
  runtime: CLIAppRuntime,
  prompt: string,
  streams: PrintStreams,
  options: { output?: "text" | "json" } = {},
): Promise<number> {
  const output = options.output ?? "text";
  const unsubscribe = denyPendingApprovals(runtime);
  try {
    await runtime.submitInput(prompt);
    const state = runtime.getState();
    if (state.panel.type === "error") {
      writePrintError(streams, state, state.panel.message, output);
      return 1;
    }
    if (state.error !== null) {
      writePrintError(streams, state, state.error, output);
      return 1;
    }

    const text = latestAssistantText(state.messages);
    if (text === null) {
      writePrintError(streams, state, "No assistant response", output);
      return 1;
    }
    if (output === "json") {
      streams.stdout(formatPrintResultJson({
        ok: true,
        response: text,
        error: null,
        sessionId: state.sessionId,
        modelName: state.modelName,
      }));
      return 0;
    }
    streams.stdout(text.endsWith("\n") ? text : `${text}\n`);
    return 0;
  } catch (error: unknown) {
    writePrintError(streams, runtime.getState(), errorMessage(error), output);
    return 1;
  } finally {
    unsubscribe();
    await runtime.destroy();
  }
}

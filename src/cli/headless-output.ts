import { z } from "zod";
import { createFunctionSchema } from "../core/index.js";

export const HeadlessStreamsSchema = z.object({
  stdout: createFunctionSchema<(text: string) => void>(),
  stderr: createFunctionSchema<(text: string) => void>(),
});
export type HeadlessStreams = z.infer<typeof HeadlessStreamsSchema>;

export const HeadlessOutputSchema = z.enum(["text", "json"]);
export type HeadlessOutput = z.infer<typeof HeadlessOutputSchema>;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatHeadlessErrorJson(message: string): string {
  return `${JSON.stringify({ ok: false, error: message }, null, 2)}\n`;
}

export function writeHeadlessError(
  streams: HeadlessStreams,
  message: string,
  output: HeadlessOutput,
): void {
  if (output === "json") {
    streams.stdout(formatHeadlessErrorJson(message));
    return;
  }
  streams.stderr(`${message}\n`);
}

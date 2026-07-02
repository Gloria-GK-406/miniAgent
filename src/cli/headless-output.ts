export interface HeadlessStreams {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

export type HeadlessOutput = "text" | "json";

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

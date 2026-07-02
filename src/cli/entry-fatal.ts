import { errorMessage, writeHeadlessError, type HeadlessOutput, type HeadlessStreams } from "./headless-output.js";

export function writeCLIEntryFatal(
  streams: HeadlessStreams,
  error: unknown,
  output: HeadlessOutput = "text",
): void {
  const message = errorMessage(error);
  writeHeadlessError(streams, output === "json" ? message : `Fatal: ${message}`, output);
}

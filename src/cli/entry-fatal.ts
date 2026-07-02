import { ConfigTemplateCreatedError } from "./config.js";
import { errorMessage, writeHeadlessError, type HeadlessOutput, type HeadlessStreams } from "./headless-output.js";

const CONFIG_TEMPLATE_MESSAGE = "Please add your provider configurations and run again.";

export function writeCLIEntryFatal(
  streams: HeadlessStreams,
  error: unknown,
  output: HeadlessOutput = "text",
): void {
  const message = errorMessage(error);
  writeHeadlessError(streams, output === "json" ? message : `Fatal: ${message}`, output);
}

export function writeCLIEntryConfigTemplateCreated(
  streams: HeadlessStreams,
  configPath: string,
  output: HeadlessOutput = "text",
): void {
  if (output === "json") {
    streams.stdout(`${JSON.stringify({
      ok: true,
      created: true,
      configPath,
      message: CONFIG_TEMPLATE_MESSAGE,
    }, null, 2)}\n`);
    return;
  }

  streams.stdout([
    `Config template created at ${configPath}`,
    CONFIG_TEMPLATE_MESSAGE,
    "",
  ].join("\n"));
}

export function writeCLIEntryError(
  streams: HeadlessStreams,
  error: unknown,
  output: HeadlessOutput = "text",
): number {
  if (error instanceof ConfigTemplateCreatedError) {
    writeCLIEntryConfigTemplateCreated(streams, error.configPath, output);
    return 0;
  }

  writeCLIEntryFatal(streams, error, output);
  return 1;
}

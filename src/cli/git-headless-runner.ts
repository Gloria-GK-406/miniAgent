import type { PrintStreams } from "./print-runner.js";
import { errorMessage, writeHeadlessError } from "./headless-output.js";
import { createGitService } from "./runtime/git-service.js";

export type GitHeadlessAction = "status" | "log" | "diff";
export type GitHeadlessOutput = "text" | "json";

export interface GitHeadlessRequest {
  baseDir: string;
  action: GitHeadlessAction;
  limit?: number;
  path?: string;
  staged?: boolean;
  output?: GitHeadlessOutput;
}

export interface GitHeadlessResult {
  ok: boolean;
  action: GitHeadlessAction;
  content: string;
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function emptyFallback(action: GitHeadlessAction): string {
  switch (action) {
    case "status":
      return "Clean working tree\n";
    case "log":
      return "No commits\n";
    case "diff":
      return "No diff\n";
  }
}

export function formatGitHeadlessResultJson(result: GitHeadlessResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export function formatGitHeadlessText(result: GitHeadlessResult): string {
  return result.content.trim().length === 0
    ? emptyFallback(result.action)
    : ensureTrailingNewline(result.content);
}

export async function runGitHeadless(
  request: GitHeadlessRequest,
  streams: PrintStreams,
): Promise<number> {
  const output = request.output ?? "text";
  try {
    const service = createGitService(request.baseDir);
    if (!(await service.isRepository())) {
      writeHeadlessError(streams, "Not a git repository", output);
      return 1;
    }

    let content: string;
    switch (request.action) {
      case "status":
        content = await service.statusShort();
        break;
      case "log":
        content = await service.log({
          ...(request.limit !== undefined && { limit: request.limit }),
        });
        break;
      case "diff":
        content = await service.diff({
          ...(request.path !== undefined && { path: request.path }),
          ...(request.staged !== undefined && { staged: request.staged }),
        });
        break;
    }

    const result = {
      ok: true,
      action: request.action,
      content,
    };
    streams.stdout(
      output === "json"
        ? formatGitHeadlessResultJson(result)
        : formatGitHeadlessText(result),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  }
}

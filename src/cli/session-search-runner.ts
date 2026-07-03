import { errorMessage, writeHeadlessError } from "./headless-output.js";
import type { PrintStreams } from "./print-runner.js";
import type { CLIAppRuntime, CLISessionSearchHit } from "./runtime/types.js";

export type SessionSearchOutput = "text" | "json";

function plural(count: number, noun: string): string {
  if (noun === "match") {
    return `${count} ${count === 1 ? "match" : "matches"}`;
  }
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function formatSessionSearch(query: string, hits: CLISessionSearchHit[]): string {
  if (hits.length === 0) {
    return `No session matches for "${query}"\n`;
  }
  return `${[
    `Search all sessions "${query}" (${plural(hits.length, "match")})`,
    ...hits.map((hit) =>
      `${hit.sessionName} (${hit.sessionId}) #${hit.index} ${hit.role} ${hit.preview}`),
  ].join("\n")}\n`;
}

export function formatSessionSearchJson(query: string, hits: CLISessionSearchHit[]): string {
  return `${JSON.stringify({ ok: true, query, hits }, null, 2)}\n`;
}

export async function runSessionSearch(
  runtime: CLIAppRuntime,
  streams: PrintStreams,
  options: { query: string; output?: SessionSearchOutput },
): Promise<number> {
  const output = options.output ?? "text";
  try {
    const hits = await runtime.searchSessions(options.query);
    streams.stdout(
      output === "json"
        ? formatSessionSearchJson(options.query, hits)
        : formatSessionSearch(options.query, hits),
    );
    return 0;
  } catch (error: unknown) {
    writeHeadlessError(streams, errorMessage(error), output);
    return 1;
  } finally {
    await runtime.destroy();
  }
}

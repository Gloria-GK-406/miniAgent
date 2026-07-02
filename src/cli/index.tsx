#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "ink";
import { App } from "./components/App.js";
import { runDoctorChecks } from "./doctor-runner.js";
import { formatCLIHelp, parseCLIEntryArgs } from "./entry-args.js";
import { applyCLIEntryRuntimeOptions } from "./entry-runtime-options.js";
import { runPrintPrompt } from "./print-runner.js";
import { createCLIRuntime } from "./runtime/app.js";
import { createCLISessionService } from "./runtime/session-service.js";
import { formatSessionList } from "./session-list-runner.js";

function readPackageVersion(): string {
  const packagePath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
  const raw = JSON.parse(readFileSync(packagePath, "utf-8")) as { version?: unknown };
  return typeof raw.version === "string" ? raw.version : "unknown";
}

async function main(): Promise<void> {
  const action = parseCLIEntryArgs(process.argv.slice(2));
  if (action.type === "help") {
    process.stdout.write(`${formatCLIHelp()}\n`);
    return;
  }
  if (action.type === "version") {
    process.stdout.write(`${readPackageVersion()}\n`);
    return;
  }
  if (action.type === "error") {
    process.stderr.write(`${action.message}\n\n${formatCLIHelp()}\n`);
    process.exitCode = 1;
    return;
  }
  if (action.type === "list-sessions") {
    try {
      const service = await createCLISessionService(resolve(action.cwd ?? process.cwd()));
      let activeSessionId: string | undefined;
      try {
        activeSessionId = service.getActiveSession().id;
      } catch {
        activeSessionId = undefined;
      }
      process.stdout.write(formatSessionList(service.listSessions(), activeSessionId));
    } catch (e: unknown) {
      process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exitCode = 1;
    }
    return;
  }
  if (action.type === "doctor") {
    try {
      const runtime = await createCLIRuntime(resolve(action.cwd ?? process.cwd()));
      await applyCLIEntryRuntimeOptions(runtime, action);
      process.exitCode = await runDoctorChecks(runtime, {
        stdout: (text) => process.stdout.write(text),
        stderr: (text) => process.stderr.write(text),
      });
    } catch (e: unknown) {
      process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exitCode = 1;
    }
    return;
  }
  if (action.type === "print") {
    try {
      const runtime = await createCLIRuntime(resolve(action.cwd ?? process.cwd()));
      await applyCLIEntryRuntimeOptions(runtime, action);
      process.exitCode = await runPrintPrompt(runtime, action.prompt, {
        stdout: (text) => process.stdout.write(text),
        stderr: (text) => process.stderr.write(text),
      });
    } catch (e: unknown) {
      process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exitCode = 1;
    }
    return;
  }

  process.stdout.write("\x1b[?1049h");
  process.stdout.write("\x1b[2J\x1b[H");

  const cleanup = (): void => {
    process.stdout.write("\x1b[?1049l");
  };
  process.on("exit", cleanup);

  try {
    const runtime = await createCLIRuntime(resolve(action.cwd ?? process.cwd()));
    await applyCLIEntryRuntimeOptions(runtime, action);
    render(<App runtime={runtime} />, { exitOnCtrlC: false });
    if (action.prompt !== undefined) {
      void runtime.submitInput(action.prompt);
    }
  } catch (e: unknown) {
    process.stdout.write("\x1b[?1049l");
    process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
}

main();

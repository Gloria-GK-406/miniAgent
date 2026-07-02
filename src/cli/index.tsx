#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "ink";
import { formatCompletionScript } from "./completion-runner.js";
import { runCommandList } from "./command-list-runner.js";
import { runConfigPaths } from "./config-paths-runner.js";
import { App } from "./components/App.js";
import { runHeadlessDiagnostics } from "./diagnostics-runner.js";
import { runDoctorChecks } from "./doctor-runner.js";
import { formatCLIHelp, parseCLIEntryArgs } from "./entry-args.js";
import { loadEntryPrompt } from "./entry-prompt.js";
import { applyCLIEntryRuntimeOptions } from "./entry-runtime-options.js";
import { runInitConfig } from "./init-runner.js";
import { runModelList } from "./model-list-runner.js";
import { runPrintPrompt } from "./print-runner.js";
import { createCLIRuntime } from "./runtime/app.js";
import { createCLISessionService } from "./runtime/session-service.js";
import { runSessionDelete } from "./session-delete-runner.js";
import { runSessionExport } from "./session-export-runner.js";
import { runSessionFork } from "./session-fork-runner.js";
import { runSessionImport } from "./session-import-runner.js";
import { formatSessionList, formatSessionListJson } from "./session-list-runner.js";
import { runSessionRename } from "./session-rename-runner.js";
import { runShowConfig } from "./show-config-runner.js";

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
  if (action.type === "completion") {
    process.stdout.write(formatCompletionScript(action.shell));
    return;
  }
  if (action.type === "config-paths") {
    process.exitCode = runConfigPaths({
      baseDir: resolve(action.cwd ?? process.cwd()),
      ...(action.output !== undefined && { output: action.output }),
    }, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
    return;
  }
  if (action.type === "show-config") {
    process.exitCode = await runShowConfig({
      baseDir: resolve(action.cwd ?? process.cwd()),
      ...(action.output !== undefined && { output: action.output }),
    }, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
    return;
  }
  if (action.type === "init") {
    process.exitCode = await runInitConfig({
      baseDir: resolve(action.cwd ?? process.cwd()),
      ...(action.force === true && { force: true }),
      ...(action.output !== undefined && { output: action.output }),
    }, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
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
      const sessions = service.listSessions();
      process.stdout.write(
        action.output === "json"
          ? formatSessionListJson(sessions, activeSessionId)
          : formatSessionList(sessions, activeSessionId),
      );
    } catch (e: unknown) {
      process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exitCode = 1;
    }
    return;
  }
  if (action.type === "list-models") {
    process.exitCode = await runModelList({
      baseDir: resolve(action.cwd ?? process.cwd()),
      ...(action.output !== undefined && { output: action.output }),
    }, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
    return;
  }
  if (action.type === "list-commands") {
    process.exitCode = await runCommandList({
      baseDir: resolve(action.cwd ?? process.cwd()),
      ...(action.output !== undefined && { output: action.output }),
    }, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
    return;
  }
  if (action.type === "export-session") {
    process.exitCode = await runSessionExport({
      baseDir: resolve(action.cwd ?? process.cwd()),
      ...(action.sessionId !== undefined && { sessionId: action.sessionId }),
      ...(action.format !== undefined && { format: action.format }),
      ...(action.outputPath !== undefined && { outputPath: action.outputPath }),
      ...(action.output !== undefined && { output: action.output }),
    }, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
    return;
  }
  if (action.type === "import-session") {
    process.exitCode = await runSessionImport({
      baseDir: resolve(action.cwd ?? process.cwd()),
      inputPath: action.inputPath,
      ...(action.name !== undefined && { name: action.name }),
      ...(action.output !== undefined && { output: action.output }),
    }, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
    return;
  }
  if (action.type === "delete-session") {
    process.exitCode = await runSessionDelete({
      baseDir: resolve(action.cwd ?? process.cwd()),
      sessionId: action.sessionId,
      ...(action.output !== undefined && { output: action.output }),
    }, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
    return;
  }
  if (action.type === "rename-session") {
    process.exitCode = await runSessionRename({
      baseDir: resolve(action.cwd ?? process.cwd()),
      sessionId: action.sessionId,
      name: action.name,
      ...(action.output !== undefined && { output: action.output }),
    }, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
    return;
  }
  if (action.type === "fork-session") {
    process.exitCode = await runSessionFork({
      baseDir: resolve(action.cwd ?? process.cwd()),
      sessionId: action.sessionId,
      ...(action.name !== undefined && { name: action.name }),
      ...(action.output !== undefined && { output: action.output }),
    }, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
    return;
  }
  if (action.type === "diagnostics") {
    process.exitCode = await runHeadlessDiagnostics({
      baseDir: resolve(action.cwd ?? process.cwd()),
      ...(action.output !== undefined && { output: action.output }),
    }, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
    });
    return;
  }
  if (action.type === "doctor") {
    try {
      const runtime = await createCLIRuntime(resolve(action.cwd ?? process.cwd()));
      await applyCLIEntryRuntimeOptions(runtime, action);
      process.exitCode = await runDoctorChecks(
        runtime,
        {
          stdout: (text) => process.stdout.write(text),
          stderr: (text) => process.stderr.write(text),
        },
        {
          ...(action.output !== undefined && { output: action.output }),
        },
      );
    } catch (e: unknown) {
      process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exitCode = 1;
    }
    return;
  }
  if (action.type === "print") {
    try {
      const cwd = resolve(action.cwd ?? process.cwd());
      const runtime = await createCLIRuntime(cwd);
      await applyCLIEntryRuntimeOptions(runtime, action);
      const prompt = await loadEntryPrompt(action, cwd);
      if (prompt === undefined) {
        throw new Error("Missing prompt for --print");
      }
      process.exitCode = await runPrintPrompt(
        runtime,
        prompt,
        {
          stdout: (text) => process.stdout.write(text),
          stderr: (text) => process.stderr.write(text),
        },
        {
          ...(action.output !== undefined && { output: action.output }),
        },
      );
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
    const cwd = resolve(action.cwd ?? process.cwd());
    const runtime = await createCLIRuntime(cwd);
    await applyCLIEntryRuntimeOptions(runtime, action);
    render(<App runtime={runtime} />, { exitOnCtrlC: false });
    const prompt = await loadEntryPrompt(action, cwd);
    if (prompt !== undefined) {
      void runtime.submitInput(prompt);
    }
  } catch (e: unknown) {
    process.stdout.write("\x1b[?1049l");
    process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
}

main();

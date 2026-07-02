import { render } from "ink";
import { App } from "./components/App.js";
import { createCLIRuntime } from "./runtime/app.js";

async function main(): Promise<void> {
  process.stdout.write("\x1b[?1049h");
  process.stdout.write("\x1b[2J\x1b[H");

  const cleanup = (): void => {
    process.stdout.write("\x1b[?1049l");
  };
  process.on("exit", cleanup);

  try {
    const runtime = await createCLIRuntime(process.cwd());
    render(<App runtime={runtime} />, { exitOnCtrlC: false });
  } catch (e: unknown) {
    process.stdout.write("\x1b[?1049l");
    process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
}

main();

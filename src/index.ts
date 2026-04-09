import { CLI } from "./cli/index.js";

const cli = new CLI();
cli.start().catch((e: unknown) => {
  console.error(`Fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});

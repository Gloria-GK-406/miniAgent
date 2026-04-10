import { CLI } from "./cli.js";

export { CLI } from "./cli.js";
export { CLIAGENT_DIR, loadConfig, findModel, toModelConfig } from "./config.js";
export type { CLIConfig, CLIModel } from "./config.js";

const cli = new CLI();
cli.start().catch((e: unknown) => {
    console.error(`Fatal: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
});

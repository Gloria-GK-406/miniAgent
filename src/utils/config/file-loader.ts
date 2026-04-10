import { readFile } from "node:fs/promises";
import { PersistConfigFileSchema } from "../../core/config.js";
import type { PersistConfigFile } from "../../core/config.js";

export class PersistentConfigFileLoader {
    static async loadFile(path: string): Promise<PersistConfigFile> {
        const content = await readFile(path, "utf-8");

        let parsed: unknown;
        try {
            parsed = JSON.parse(content);
        } catch (error: unknown) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`Invalid JSON in config file ${path}: ${reason}`, { cause: error });
        }

        const result = PersistConfigFileSchema.safeParse(parsed);
        if (!result.success) {
            const details = result.error.issues
                .map((issue) => {
                    const location = issue.path.length > 0 ? issue.path.join(".") : "<root>";
                    return `${location}: ${issue.message}`;
                })
                .join("; ");
            throw new Error(`Invalid config file ${path}: ${details}`);
        }

        return result.data;
    }

    static async loadFiles(paths: string[]): Promise<PersistConfigFile[]> {
        return Promise.all(paths.map((path) => this.loadFile(path)));
    }
}

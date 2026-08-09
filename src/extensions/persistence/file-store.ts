import { promises as fs } from "node:fs";
import { join, isAbsolute } from "node:path";
import type { Store } from "../../core/index.js";

export class FileStore implements Store {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  private resolve(path: string): string {
    if (isAbsolute(path)) {
      throw new Error(`Path must be relative, got absolute path: ${path}`);
    }
    return join(this.basePath, path);
  }

  async readFile(path: string): Promise<string> {
    const resolved = this.resolve(path);
    return fs.readFile(resolved, "utf-8");
  }

  async writeFile(path: string, data: string): Promise<void> {
    const resolved = this.resolve(path);
    await fs.mkdir(join(resolved, ".."), { recursive: true });
    await fs.writeFile(resolved, data, "utf-8");
  }

  async writeJsonTo<T>(path: string, data: T): Promise<void> {
    const json = JSON.stringify(data, null, 2);
    await this.writeFile(path, json);
  }

  async readJsonFrom<T>(path: string): Promise<T> {
    const content = await this.readFile(path);
    return JSON.parse(content) as T;
  }

  async appendFile(path: string, data: string): Promise<void> {
    const resolved = this.resolve(path);
    await fs.mkdir(join(resolved, ".."), { recursive: true });
    await fs.appendFile(resolved, data, "utf-8");
  }
}

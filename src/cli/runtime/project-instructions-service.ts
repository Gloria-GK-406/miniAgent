import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface ProjectInstructionsResult {
  written: boolean;
  path: string;
}

export interface ProjectInstructionsService {
  buildInstructions(): Promise<string>;
  initialize(options: { overwrite: boolean }): Promise<ProjectInstructionsResult>;
}

interface PackageJson {
  name?: unknown;
  scripts?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
}

async function readTextIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function hasPath(path: string): Promise<boolean> {
  return (await readTextIfExists(path)) !== null;
}

async function readPackageJson(baseDir: string): Promise<PackageJson> {
  const content = await readTextIfExists(join(baseDir, "package.json"));
  if (content === null) return {};
  return JSON.parse(content) as PackageJson;
}

function recordKeys(value: unknown): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value);
}

function projectName(pkg: PackageJson, baseDir: string): string {
  return typeof pkg.name === "string" && pkg.name.length > 0
    ? pkg.name
    : baseDir.split(/[\\/]/).at(-1) ?? "project";
}

function packageManagerCommand(scriptName: string): string {
  return scriptName === "test" ? "npm test" : `npm run ${scriptName}`;
}

async function listTopLevelDirs(baseDir: string): Promise<string[]> {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith(".") && name !== "node_modules" && name !== "dist")
      .sort()
      .map((name) => `${name}/`);
  } catch {
    return [];
  }
}

async function detectStack(baseDir: string, pkg: PackageJson): Promise<string[]> {
  const deps = new Set([
    ...recordKeys(pkg.dependencies),
    ...recordKeys(pkg.devDependencies),
  ]);
  const stack: string[] = ["Node.js"];
  if (await hasPath(join(baseDir, "tsconfig.json")) || deps.has("typescript")) {
    stack.push("TypeScript");
  }
  if (deps.has("vitest")) {
    stack.push("Vitest");
  }
  if (deps.has("zod")) {
    stack.push("Zod");
  }
  return stack;
}

function renderList(items: string[], fallback: string): string[] {
  if (items.length === 0) return [`- ${fallback}`];
  return items.map((item) => `- ${item}`);
}

export function createProjectInstructionsService(baseDir: string): ProjectInstructionsService {
  const outputPath = join(baseDir, "AGENTS.md");

  return {
    buildInstructions: async () => {
      const pkg = await readPackageJson(baseDir);
      const scripts = recordKeys(pkg.scripts).sort();
      const stack = await detectStack(baseDir, pkg);
      const dirs = await listTopLevelDirs(baseDir);
      return [
        `# ${projectName(pkg, baseDir)}`,
        "",
        "## Project Overview",
        "",
        "This file gives coding agents project-local guidance. Keep it current when tooling, layout, or conventions change.",
        "",
        "## Stack",
        "",
        ...renderList(stack, "Inspect package.json and project files before assuming a stack."),
        "",
        "## Common Commands",
        "",
        ...renderList(scripts.map(packageManagerCommand), "No package scripts detected."),
        "",
        "## Layout",
        "",
        ...renderList(dirs, "Inspect the repository tree before editing."),
        "",
        "## Working Rules",
        "",
        "- Prefer existing project patterns over new abstractions.",
        "- Keep changes scoped to the requested behavior.",
        "- Run focused tests for touched code before broader checks.",
        "- Do not overwrite user changes without explicit approval.",
        "",
      ].join("\n");
    },
    initialize: async ({ overwrite }) => {
      if (!overwrite && await readTextIfExists(outputPath) !== null) {
        return { written: false, path: outputPath };
      }
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, await createProjectInstructionsService(baseDir).buildInstructions(), "utf-8");
      return { written: true, path: outputPath };
    },
  };
}

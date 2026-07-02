import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProjectInstructionsService } from "./project-instructions-service.js";

async function createProject(): Promise<string> {
  const baseDir = await mkdtemp(join(tmpdir(), "miniagent-init-"));
  await mkdir(join(baseDir, "src"), { recursive: true });
  await writeFile(join(baseDir, "package.json"), JSON.stringify({
    name: "demo-project",
    scripts: {
      lint: "eslint src",
      build: "tsc",
      test: "vitest run",
    },
    dependencies: {
      zod: "^3.0.0",
    },
    devDependencies: {
      typescript: "^6.0.0",
      vitest: "^4.0.0",
    },
  }, null, 2), "utf-8");
  await writeFile(join(baseDir, "tsconfig.json"), "{}", "utf-8");
  return baseDir;
}

describe("createProjectInstructionsService", () => {
  it("generates project-aware AGENTS.md content", async () => {
    const baseDir = await createProject();
    const service = createProjectInstructionsService(baseDir);

    await expect(service.buildInstructions()).resolves.toContain("# demo-project");
    await expect(service.buildInstructions()).resolves.toContain("npm run lint");
    await expect(service.buildInstructions()).resolves.toContain("TypeScript");
    await expect(service.buildInstructions()).resolves.toContain("src/");
  });

  it("writes AGENTS.md when absent", async () => {
    const baseDir = await createProject();
    const service = createProjectInstructionsService(baseDir);

    await expect(service.initialize({ overwrite: false })).resolves.toMatchObject({
      written: true,
      path: join(baseDir, "AGENTS.md"),
    });
    await expect(readFile(join(baseDir, "AGENTS.md"), "utf-8")).resolves.toContain("# demo-project");
  });

  it("does not overwrite existing AGENTS.md without force", async () => {
    const baseDir = await createProject();
    await writeFile(join(baseDir, "AGENTS.md"), "existing", "utf-8");
    const service = createProjectInstructionsService(baseDir);

    await expect(service.initialize({ overwrite: false })).resolves.toMatchObject({
      written: false,
      path: join(baseDir, "AGENTS.md"),
    });
    await expect(readFile(join(baseDir, "AGENTS.md"), "utf-8")).resolves.toBe("existing");
  });
});

import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CLIPermissionConfig } from "../config.js";
import {
  createPermissionConfigService,
  parsePermissionRuleTarget,
} from "./permission-config-service.js";

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf-8");
}

async function readProjectConfig(baseDir: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(join(baseDir, ".cliagent", "config.json"), "utf-8"),
  ) as Record<string, unknown>;
}

describe("parsePermissionRuleTarget", () => {
  it("parses top-level and nested permission targets", () => {
    expect(parsePermissionRuleTarget("write")).toEqual({ toolName: "write" });
    expect(parsePermissionRuleTarget("shell:npm *")).toEqual({
      toolName: "shell",
      pattern: "npm *",
    });
  });

  it("rejects empty nested targets", () => {
    expect(() => parsePermissionRuleTarget("shell:")).toThrow(
      "Permission pattern target must use <tool>:<pattern>",
    );
  });
});

describe("PermissionConfigService", () => {
  it("persists a top-level project permission rule", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-permission-config-"));
    const service = createPermissionConfigService(baseDir);
    const next = await service.setRule("write", "deny", {
      "*": "ask",
      read: "allow",
    });

    expect(next.permission.write).toBe("deny");
    await expect(readProjectConfig(baseDir)).resolves.toMatchObject({
      permission: {
        write: "deny",
      },
    });
  });

  it("persists a nested pattern while keeping the effective fallback", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-permission-nested-"));
    await writeJson(join(baseDir, ".cliagent", "config.json"), {
      permission: {
        shell: "ask",
      },
    });
    const service = createPermissionConfigService(baseDir);
    const effective: CLIPermissionConfig = {
      "*": "ask",
      shell: "ask",
    };

    const next = await service.setRule("shell:npm *", "allow", effective);

    expect(next.permission.shell).toEqual({
      "*": "ask",
      "npm *": "allow",
    });
    await expect(readProjectConfig(baseDir)).resolves.toMatchObject({
      permission: {
        shell: {
          "*": "ask",
          "npm *": "allow",
        },
      },
    });
  });

  it("unsets local rules and reloads default permission fallbacks", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-permission-unset-"));
    await writeJson(join(baseDir, ".cliagent", "config.json"), {
      permission: {
        write: "deny",
      },
    });
    const service = createPermissionConfigService(baseDir);

    const next = await service.unsetRule("write");

    expect(next.permission).toEqual({
      "*": "ask",
      read: "allow",
      glob: "allow",
      grep: "allow",
      shell: {
        "*": "ask",
        "rm -rf *": "deny",
        "rm -fr *": "deny",
        "rm -r *": "deny",
        "Remove-Item -Recurse *": "deny",
        "Remove-Item -r *": "deny",
        "rmdir /s *": "deny",
        "del /s *": "deny",
      },
    });
    await expect(readProjectConfig(baseDir)).resolves.toEqual({});
  });

  it("unsets nested pattern rules without removing sibling patterns", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-permission-unset-nested-"));
    await writeJson(join(baseDir, ".cliagent", "config.json"), {
      permission: {
        shell: {
          "*": "ask",
          "npm *": "allow",
          "rm *": "deny",
        },
      },
    });
    const service = createPermissionConfigService(baseDir);

    const next = await service.unsetRule("shell:npm *");

    expect(next.permission.shell).toEqual({
      "*": "ask",
      "rm *": "deny",
    });
    await expect(readProjectConfig(baseDir)).resolves.toMatchObject({
      permission: {
        shell: {
          "*": "ask",
          "rm *": "deny",
        },
      },
    });
  });
});

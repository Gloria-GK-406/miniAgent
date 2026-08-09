import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../../core/index.js";
import { CLIConfigSchema } from "../config.js";
import {
  createDoctorService,
  type CLIDoctorSnapshot,
} from "./doctor-service.js";

function snapshot(overrides: Partial<CLIDoctorSnapshot> = {}): CLIDoctorSnapshot {
  return {
    config: CLIConfigSchema.parse({
      providers: [{
        engine: "openai",
        key: "sk-test",
        models: [{ id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] }],
      }],
      defaultModel: "fast",
    }),
    modelName: "openai/fast",
    modelPaths: ["openai/fast"],
    sessionId: "s1",
    sessions: [{
      id: "s1",
      name: "default",
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
      messageCount: 0,
    }],
    referencePaths: ["README.md"],
    inputHistory: [],
    autoApprove: false,
    ...overrides,
  };
}

describe("DoctorService", () => {
  it("reports healthy CLI runtime checks", async () => {
    const service = createDoctorService({
      gitService: {
        isRepository: async () => true,
        branchName: async () => "main",
      },
      diagnosticsService: {
        discoverCommands: async () => ["npm run lint"],
      },
    });

    const checks = await service.run(snapshot());

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "configuration", status: "pass" }),
      expect.objectContaining({ id: "model", status: "pass" }),
      expect.objectContaining({ id: "sessions", status: "pass" }),
      expect.objectContaining({ id: "git", status: "pass", detail: "Repository on main" }),
      expect.objectContaining({ id: "diagnostics", status: "pass" }),
      expect.objectContaining({ id: "permissions", status: "pass" }),
    ]));
  });

  it("surfaces setup warnings and failures without throwing", async () => {
    const service = createDoctorService({
      gitService: {
        isRepository: async () => false,
        branchName: async () => {
          throw new Error("not a repository");
        },
      },
      diagnosticsService: {
        discoverCommands: async () => [],
      },
    });

    const checks = await service.run(snapshot({
      config: CLIConfigSchema.parse({}),
      modelName: "(none)",
      modelPaths: [],
      sessions: [],
      referencePaths: [],
      autoApprove: true,
    }));

    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "configuration", status: "fail" }),
      expect.objectContaining({ id: "model", status: "fail" }),
      expect.objectContaining({ id: "sessions", status: "fail" }),
      expect.objectContaining({ id: "workspace", status: "warn" }),
      expect.objectContaining({ id: "git", status: "warn" }),
      expect.objectContaining({ id: "diagnostics", status: "warn" }),
      expect.objectContaining({ id: "permissions", status: "warn" }),
    ]));
  });
});

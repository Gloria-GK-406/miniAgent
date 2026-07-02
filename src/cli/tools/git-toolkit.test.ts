import { describe, expect, it, vi } from "vitest";
import { createPermissionService } from "../runtime/permission-service.js";
import type { GitService } from "../runtime/git-service.js";
import { createGitToolkit } from "./git-toolkit.js";

function createMockGitService(): GitService {
  return {
    isRepository: vi.fn(async () => true),
    statusShort: vi.fn(async () => " M a.txt\n"),
    diff: vi.fn(async () => "diff --git a/a.txt b/a.txt\n"),
    log: vi.fn(async () => "abc123 initial commit"),
    branchName: vi.fn(async () => "main"),
    commit: vi.fn(async () => "[main abc123] test"),
  };
}

describe("createGitToolkit", () => {
  it("exposes git status, diff, log, and commit tools", async () => {
    const gitService = createMockGitService();
    const toolkit = createGitToolkit({
      gitService,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
    });

    expect(toolkit.tools.map((tool) => tool.name)).toEqual([
      "git_status",
      "git_diff",
      "git_log",
      "git_commit",
    ]);

    await expect(toolkit.tools[0]!.execute({})).resolves.toContain("a.txt");
    await expect(toolkit.tools[1]!.execute({ path: "a.txt" })).resolves.toContain("diff --git");
    await expect(toolkit.tools[2]!.execute({ limit: 1 })).resolves.toContain("initial commit");
  });

  it("asks permission before committing", async () => {
    const gitService = createMockGitService();
    const requestApproval = vi.fn(async () => true);
    const toolkit = createGitToolkit({
      gitService,
      permissionService: createPermissionService({ "*": "allow", git_commit: "ask" }),
      getAutoApprove: () => false,
      requestApproval,
    });
    const commit = toolkit.tools.find((tool) => tool.name === "git_commit")!;

    await expect(commit.execute({ message: "test commit" })).resolves.toContain("test");

    expect(requestApproval).toHaveBeenCalledWith("git_commit", { message: "test commit" });
    expect(gitService.commit).toHaveBeenCalledWith("test commit");
  });
});

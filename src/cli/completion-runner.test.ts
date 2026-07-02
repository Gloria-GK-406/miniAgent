import { describe, expect, it } from "vitest";
import { formatCompletionScript } from "./completion-runner.js";

describe("formatCompletionScript", () => {
  it("includes every public headless flag in shell completions", () => {
    const longFlags = [
      "--list-models",
      "--status",
      "--overview",
      "--config-paths",
      "--show-config",
      "--init",
      "--force",
      "--staged",
      "--list-todos",
      "--list-references",
      "--list-snapshots",
      "--restore-snapshot",
      "--reapply-snapshot",
      "--show-permissions",
      "--show-system-prompt",
      "--clear-session",
    ];
    const bash = formatCompletionScript("bash");
    const zsh = formatCompletionScript("zsh");
    const fish = formatCompletionScript("fish");
    const powershell = formatCompletionScript("powershell");

    for (const flag of longFlags) {
      expect(bash).toContain(flag);
      expect(zsh).toContain(flag);
      expect(fish).toContain(`-l ${flag.slice(2)}`);
      expect(powershell).toContain(flag);
    }
  });

  it("formats bash completions", () => {
    const script = formatCompletionScript("bash");

    expect(script).toContain("complete -F _miniagent_completion miniagent");
    expect(script).toContain("--print");
    expect(script).toContain("--list-commands");
    expect(script).toContain("--list-tools");
    expect(script).toContain("--list-todos");
    expect(script).toContain("--list-agents");
    expect(script).toContain("--overview");
    expect(script).toContain("--preview-context");
    expect(script).toContain("--show-history");
    expect(script).toContain("--list-references");
    expect(script).toContain("--list-snapshots");
    expect(script).toContain("--restore-snapshot");
    expect(script).toContain("--reapply-snapshot");
    expect(script).toContain("--git-status");
    expect(script).toContain("--git-log");
    expect(script).toContain("--git-diff");
    expect(script).toContain("--show-permissions");
    expect(script).toContain("--show-system-prompt");
    expect(script).toContain("--set-permission");
    expect(script).toContain("--set-system-prompt");
    expect(script).toContain("--init-instructions");
    expect(script).toContain("--completion");
    expect(script.endsWith("\n")).toBe(true);
  });

  it("formats zsh completions", () => {
    const script = formatCompletionScript("zsh");

    expect(script).toContain("#compdef miniagent");
    expect(script).toContain("--agent");
    expect(script).toContain("build plan");
  });

  it("formats fish completions", () => {
    const script = formatCompletionScript("fish");

    expect(script).toContain("complete -c miniagent");
    expect(script).toContain("-l diagnostics");
    expect(script).toContain("-l system-prompt-file");
    expect(script).toContain("Use - to read stdin");
  });

  it("formats powershell completions", () => {
    const script = formatCompletionScript("powershell");

    expect(script).toContain("Register-ArgumentCompleter");
    expect(script).toContain("--fork-session");
  });
});

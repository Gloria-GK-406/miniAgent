import { describe, expect, it } from "vitest";
import { formatCompletionScript } from "./completion-runner.js";

describe("formatCompletionScript", () => {
  it("formats bash completions", () => {
    const script = formatCompletionScript("bash");

    expect(script).toContain("complete -F _miniagent_completion miniagent");
    expect(script).toContain("--print");
    expect(script).toContain("--list-commands");
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
  });

  it("formats powershell completions", () => {
    const script = formatCompletionScript("powershell");

    expect(script).toContain("Register-ArgumentCompleter");
    expect(script).toContain("--fork-session");
  });
});

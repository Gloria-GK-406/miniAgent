// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  applySuggestion,
  matchSuggestions,
  useSuggestion,
} from "./useSuggestion.js";

describe("matchSuggestions", () => {
  it("returns empty for empty input", () => {
    expect(matchSuggestions("")).toEqual([]);
  });

  it("returns empty for non-command input", () => {
    expect(matchSuggestions("hello")).toEqual([]);
  });

  it("matches file references after @", () => {
    const paths = ["README.md", "src/agent.ts", "src/core/types.ts"];
    expect(matchSuggestions("Explain @sr", undefined, paths)).toEqual([
      "@src/agent.ts",
      "@src/core/types.ts",
    ]);
  });

  it("fuzzy matches file references after @", () => {
    const paths = ["README.md", "src/core/agent.ts", "docs/spec.md"];
    expect(matchSuggestions("Explain @sca", undefined, paths)).toEqual([
      "@src/core/agent.ts",
    ]);
  });

  it("matches /h to help and history", () => {
    const result = matchSuggestions("/h");
    expect(result).toEqual(["/help", "/history"]);
  });

  it("matches about and version commands", () => {
    expect(matchSuggestions("/ab")).toEqual(["/about"]);
    expect(matchSuggestions("/ver")).toEqual(["/version"]);
  });

  it("matches /agent to build and plan", () => {
    const result = matchSuggestions("/agent");
    expect(result).toEqual(["list", "build", "plan"]);
  });

  it("matches /agent pl to plan", () => {
    const result = matchSuggestions("/agent pl");
    expect(result).toEqual(["plan"]);
  });

  it("matches /sessions subcommands", () => {
    expect(matchSuggestions("/sessions")).toEqual([
      "search",
      "new",
      "switch",
      "fork",
      "rename",
      "delete",
    ]);
    expect(matchSuggestions("/sessions sw")).toEqual(["switch"]);
  });

  it("matches session ids after session management subcommands", () => {
    const sessions = ["s1-alpha", "s2-beta"];
    expect(matchSuggestions("/sessions switch s1", undefined, undefined, undefined, sessions)).toEqual([
      "s1-alpha",
    ]);
    expect(matchSuggestions("/session delete ", undefined, undefined, undefined, sessions)).toEqual(sessions);
  });

  it("matches /permissions subcommands and alias", () => {
    expect(matchSuggestions("/permissions")).toEqual(["set", "unset"]);
    expect(matchSuggestions("/permission se")).toEqual(["set"]);
  });

  it("matches /git subcommands", () => {
    expect(matchSuggestions("/git")).toEqual(["status", "log"]);
    expect(matchSuggestions("/git l")).toEqual(["log"]);
  });

  it("matches /diff flags", () => {
    expect(matchSuggestions("/diff")).toEqual(["--staged"]);
    expect(matchSuggestions("/diff --")).toEqual(["--staged"]);
  });

  it("matches /export formats", () => {
    expect(matchSuggestions("/export")).toEqual(["json", "markdown"]);
    expect(matchSuggestions("/export m")).toEqual(["markdown"]);
  });

  it("matches /system subcommands", () => {
    expect(matchSuggestions("/system")).toEqual(["set", "unset"]);
    expect(matchSuggestions("/system un")).toEqual(["unset"]);
  });

  it("matches help query command names", () => {
    expect(matchSuggestions("/help d", undefined, undefined, [
      "/diff",
      "/diagnostics",
      "/doctor",
      "/git",
    ])).toEqual(["diff", "diagnostics", "doctor"]);
    expect(matchSuggestions("/commands di", undefined, undefined, [
      "/diff",
      "/diagnostics",
      "/doctor",
    ])).toEqual(["diff", "diagnostics"]);
  });

  it("hides exact /auto because it has no subcommands", () => {
    const result = matchSuggestions("/auto");
    expect(result).toEqual([]);
  });

  it("matches /model with modelPaths", () => {
    const paths = ["anthropic/claude", "openai/gpt-4", "anthropic/haiku"];
    const result = matchSuggestions("/model ant", paths);
    expect(result).toEqual(["anthropic/claude", "anthropic/haiku"]);
  });

  it("matches /model empty to all modelPaths", () => {
    const paths = ["anthropic/claude", "openai/gpt-4"];
    const result = matchSuggestions("/model ", paths);
    expect(result).toEqual(["anthropic/claude", "openai/gpt-4"]);
  });

  it("returns all matching model suggestions", () => {
    const paths = Array.from({ length: 10 }, (_, i) => `provider/id-${i}`);
    const result = matchSuggestions("/model ", paths);
    expect(result).toHaveLength(10);
  });

  it("matches /q to quit", () => {
    const result = matchSuggestions("/q");
    expect(result).toEqual(["/quit"]);
  });

  it("matches single exact command without subcommands", () => {
    const result = matchSuggestions("/details");
    expect(result).toEqual([]);
  });

  it("hides exact command after completion when no follow-up suggestions exist", () => {
    expect(matchSuggestions("/help")).toEqual([]);
    expect(matchSuggestions("/tools")).toEqual([]);
  });

  it("matches /co to context", () => {
    const result = matchSuggestions("/co");
    expect(result).toEqual(["/commands", "/compact", "/context"]);
  });

  it("matches /comm to commands", () => {
    const result = matchSuggestions("/comm");
    expect(result).toEqual(["/commands"]);
  });

  it("matches /ke to keybindings", () => {
    const result = matchSuggestions("/ke");
    expect(result).toEqual(["/keybindings"]);
  });

  it("matches /ref to references", () => {
    const result = matchSuggestions("/ref");
    expect(result).toEqual(["/references"]);
  });

  it("matches transcript search commands", () => {
    expect(matchSuggestions("/sea")).toEqual(["/search"]);
    expect(matchSuggestions("/fi")).toEqual(["/find"]);
  });

  it("matches input history commands", () => {
    expect(matchSuggestions("/inp")).toEqual(["/input-history", "/inputs"]);
    expect(matchSuggestions("/prom")).toEqual(["/prompts"]);
  });

  it("matches todo panel commands", () => {
    expect(matchSuggestions("/tod")).toEqual(["/todo", "/todos"]);
    expect(matchSuggestions("/ta")).toEqual(["/tasks"]);
  });

  it("matches Phase 2 commands", () => {
    expect(matchSuggestions("/n")).toEqual(["/new"]);
    expect(matchSuggestions("/ex")).toEqual(["/exit", "/export"]);
    expect(matchSuggestions("/i")).toEqual(["/import", "/init", "/input-history", "/inputs"]);
    expect(matchSuggestions("/u")).toEqual(["/undo"]);
    expect(matchSuggestions("/r")).toEqual(["/references", "/redo"]);
    expect(matchSuggestions("/comp")).toEqual(["/compact"]);
  });

  it("matches Phase 3 commands", () => {
    expect(matchSuggestions("/g")).toEqual(["/git"]);
    expect(matchSuggestions("/di")).toEqual(["/diff", "/diagnostics"]);
    expect(matchSuggestions("/ed")).toEqual(["/editor"]);
    expect(matchSuggestions("/ac")).toEqual(["/activity"]);
    expect(matchSuggestions("/pe")).toEqual(["/permission", "/permissions"]);
    expect(matchSuggestions("/sy")).toEqual(["/system"]);
    expect(matchSuggestions("/in")).toEqual(["/init", "/input-history", "/inputs"]);
  });

  it("matches command aliases", () => {
    expect(matchSuggestions("/do")).toEqual(["/doctor"]);
    expect(matchSuggestions("/perm")).toEqual(["/permission", "/permissions"]);
  });

  it("matches command names supplied by the runtime", () => {
    expect(matchSuggestions("/rev", undefined, undefined, ["/review", "/repair"])).toEqual([
      "/review",
    ]);
  });
});

describe("useSuggestion", () => {
  it("starts with empty suggestions", () => {
    const { result } = renderHook(() => useSuggestion());
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.selectedIndex).toBe(0);
  });

  it("updates suggestions on updateInput", () => {
    const { result } = renderHook(() => useSuggestion());
    act(() => {
      result.current.updateInput("/h");
    });
    expect(result.current.suggestions).toEqual(["/help", "/history"]);
    expect(result.current.selectedIndex).toBe(0);
  });

  it("navigates with selectNext", () => {
    const { result } = renderHook(() => useSuggestion());
    act(() => {
      result.current.updateInput("/h");
    });

    act(() => {
      result.current.selectNext();
    });
    expect(result.current.selectedIndex).toBe(1);

    act(() => {
      result.current.selectNext();
    });
    expect(result.current.selectedIndex).toBe(0);
  });

  it("wraps around with selectNext", () => {
    const { result } = renderHook(() => useSuggestion());
    act(() => {
      result.current.updateInput("/h");
    });
    expect(result.current.suggestions).toHaveLength(2);

    act(() => {
      result.current.selectNext();
      result.current.selectNext();
    });
    expect(result.current.selectedIndex).toBe(0);
  });

  it("wraps around with selectPrev", () => {
    const { result } = renderHook(() => useSuggestion());
    act(() => {
      result.current.updateInput("/h");
    });

    act(() => {
      result.current.selectPrev();
    });
    expect(result.current.selectedIndex).toBe(1);
  });

  it("resets selection on new input", () => {
    const { result } = renderHook(() => useSuggestion());
    act(() => {
      result.current.updateInput("/h");
    });

    act(() => {
      result.current.selectNext();
    });
    expect(result.current.selectedIndex).toBe(1);

    act(() => {
      result.current.updateInput("/he");
    });
    expect(result.current.selectedIndex).toBe(0);
  });

  it("resetSelection sets index to 0", () => {
    const { result } = renderHook(() => useSuggestion());
    act(() => {
      result.current.updateInput("/h");
      result.current.selectNext();
      result.current.resetSelection();
    });
    expect(result.current.selectedIndex).toBe(0);
  });

  it("no-ops navigation with empty suggestions", () => {
    const { result } = renderHook(() => useSuggestion());
    act(() => {
      result.current.selectNext();
      result.current.selectPrev();
    });
    expect(result.current.selectedIndex).toBe(0);
  });

  it("uses modelPaths from options", () => {
    const { result } = renderHook(() => useSuggestion({
      modelPaths: ["anthropic/claude", "openai/gpt-4"],
    }));
    act(() => {
      result.current.updateInput("/model ant");
    });
    expect(result.current.suggestions).toEqual(["anthropic/claude"]);
  });

  it("uses command suggestions from options", () => {
    const { result } = renderHook(() => useSuggestion({
      commandSuggestions: ["/review", "/repair"],
    }));
    act(() => {
      result.current.updateInput("/rep");
    });
    expect(result.current.suggestions).toEqual(["/repair"]);
  });

  it("uses session suggestions from options", () => {
    const { result } = renderHook(() => useSuggestion({
      sessionSuggestions: ["s1-alpha", "s2-beta"],
    }));
    act(() => {
      result.current.updateInput("/sessions switch s2");
    });
    expect(result.current.suggestions).toEqual(["s2-beta"]);
  });

  it("applies selected command completion", () => {
    const { result } = renderHook(() => useSuggestion());
    act(() => {
      result.current.updateInput("/he");
    });
    expect(result.current.applySelected("/he")).toBe("/help ");
  });

  it("applies selected file reference completion", () => {
    expect(applySuggestion("Explain @sr", "@src/agent.ts")).toBe("Explain @src/agent.ts ");
    expect(applySuggestion("Check @README.md", "@README.md")).toBe("Check @README.md");
  });

  it("adds a trailing space for permissions command completion", () => {
    expect(applySuggestion("/pe", "/permissions")).toBe("/permissions ");
  });

  it("adds a trailing space for system command completion", () => {
    expect(applySuggestion("/sy", "/system")).toBe("/system ");
  });

  it("adds a trailing space for commands query completion", () => {
    expect(applySuggestion("/comm", "/commands")).toBe("/commands ");
    expect(applySuggestion("/commands di", "diff")).toBe("/commands diff ");
  });

  it("adds a trailing space for transcript search completion", () => {
    expect(applySuggestion("/sea", "/search")).toBe("/search ");
    expect(applySuggestion("/fi", "/find")).toBe("/find ");
  });

  it("adds a trailing space for tools query completion", () => {
    expect(applySuggestion("/too", "/tools")).toBe("/tools ");
  });

  it("adds a trailing space for todo query completion", () => {
    expect(applySuggestion("/tod", "/todos")).toBe("/todos ");
    expect(applySuggestion("/ta", "/tasks")).toBe("/tasks ");
  });

  it("adds a trailing space for input history completion", () => {
    expect(applySuggestion("/input-h", "/input-history")).toBe("/input-history ");
    expect(applySuggestion("/prom", "/prompts")).toBe("/prompts ");
  });

  it("applies selected diff flag completion", () => {
    expect(applySuggestion("/diff", "--staged")).toBe("/diff --staged ");
    expect(applySuggestion("/diff --", "--staged")).toBe("/diff --staged ");
  });

  it("applies selected agent mode completion", () => {
    const { result } = renderHook(() => useSuggestion());
    act(() => {
      result.current.updateInput("/agent pl");
    });
    expect(result.current.applySelected("/agent pl")).toBe("/agent plan ");
  });

  it("does not apply when input is already complete", () => {
    expect(applySuggestion("/help", "/help")).toBe("/help");
    expect(applySuggestion("/agent plan", "plan")).toBe("/agent plan");
  });
});

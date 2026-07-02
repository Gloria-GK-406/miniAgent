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

  it("matches /h to help and history", () => {
    const result = matchSuggestions("/h");
    expect(result).toEqual(["/help", "/history"]);
  });

  it("matches /agent to build and plan", () => {
    const result = matchSuggestions("/agent");
    expect(result).toEqual(["build", "plan"]);
  });

  it("matches /agent pl to plan", () => {
    const result = matchSuggestions("/agent pl");
    expect(result).toEqual(["plan"]);
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
    expect(result).toEqual(["/compact", "/context"]);
  });

  it("matches Phase 2 commands", () => {
    expect(matchSuggestions("/n")).toEqual(["/new"]);
    expect(matchSuggestions("/ex")).toEqual(["/exit", "/export"]);
    expect(matchSuggestions("/i")).toEqual(["/import"]);
    expect(matchSuggestions("/u")).toEqual(["/undo"]);
    expect(matchSuggestions("/r")).toEqual(["/redo"]);
    expect(matchSuggestions("/comp")).toEqual(["/compact"]);
  });

  it("matches Phase 3 commands", () => {
    expect(matchSuggestions("/g")).toEqual(["/git"]);
    expect(matchSuggestions("/di")).toEqual(["/diff", "/diagnostics"]);
    expect(matchSuggestions("/ed")).toEqual(["/editor"]);
    expect(matchSuggestions("/ac")).toEqual(["/activity"]);
    expect(matchSuggestions("/pe")).toEqual(["/permissions"]);
    expect(matchSuggestions("/sy")).toEqual(["/system"]);
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

  it("applies selected command completion", () => {
    const { result } = renderHook(() => useSuggestion());
    act(() => {
      result.current.updateInput("/he");
    });
    expect(result.current.applySelected("/he")).toBe("/help");
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

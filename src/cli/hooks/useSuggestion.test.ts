// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
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

  it("matches /h → /help, /history, /hitl", () => {
    const result = matchSuggestions("/h");
    expect(result).toEqual(["/help", "/history", "/hitl"]);
  });

  it("matches /session → subcommands", () => {
    const result = matchSuggestions("/session");
    expect(result).toEqual(["new", "switch", "delete", "rename"]);
  });

  it("matches /session sw → switch", () => {
    const result = matchSuggestions("/session sw");
    expect(result).toEqual(["switch"]);
  });

  it("matches /hitl o → on, off", () => {
    const result = matchSuggestions("/hitl o");
    expect(result).toEqual(["on", "off"]);
  });

  it("matches /hitl → on, off", () => {
    const result = matchSuggestions("/hitl");
    expect(result).toEqual(["on", "off"]);
  });

  it("matches /model with modelPaths", () => {
    const paths = ["anthropic/claude", "openai/gpt-4", "anthropic/haiku"];
    const result = matchSuggestions("/model ant", paths);
    expect(result).toEqual(["anthropic/claude", "anthropic/haiku"]);
  });

  it("matches /model <empty> → all modelPaths", () => {
    const paths = ["anthropic/claude", "openai/gpt-4"];
    const result = matchSuggestions("/model ", paths);
    expect(result).toEqual(["anthropic/claude", "openai/gpt-4"]);
  });

  it("returns all matching model suggestions", () => {
    const paths = Array.from({ length: 10 }, (_, i) => `provider/model-${i}`);
    const result = matchSuggestions("/model ", paths);
    expect(result).toHaveLength(10);
  });

  it("matches /q → /quit, /exit", () => {
    const result = matchSuggestions("/q");
    expect(result).toEqual(["/quit"]);
  });

  it("matches single exact command without subcommands", () => {
    const result = matchSuggestions("/clear");
    expect(result).toEqual([]);
  });

  it("hides exact command after completion when no follow-up suggestions exist", () => {
    expect(matchSuggestions("/help")).toEqual([]);
    expect(matchSuggestions("/tools")).toEqual([]);
  });

  it("matches /co → /compress, /context", () => {
    const result = matchSuggestions("/co");
    expect(result).toEqual(["/compress", "/context"]);
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
    expect(result.current.suggestions).toEqual(["/help", "/history", "/hitl"]);
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
    expect(result.current.selectedIndex).toBe(2);
  });

  it("wraps around with selectNext", () => {
    const { result } = renderHook(() => useSuggestion());
    act(() => {
      result.current.updateInput("/h");
    });
    expect(result.current.suggestions).toHaveLength(3);

    act(() => {
      result.current.selectNext();
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
    expect(result.current.selectedIndex).toBe(2);
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

  it("applies selected subcommand completion", () => {
    const { result } = renderHook(() => useSuggestion());
    act(() => {
      result.current.updateInput("/session sw");
    });
    expect(result.current.applySelected("/session sw")).toBe("/session switch ");
  });

  it("does not apply when input is already complete", () => {
    expect(applySuggestion("/help", "/help")).toBe("/help");
    expect(applySuggestion("/hitl on", "on")).toBe("/hitl on");
  });
});

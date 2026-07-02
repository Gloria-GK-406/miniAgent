// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  appendInputHistory,
  useInputHistory,
} from "./useInputHistory.js";

describe("appendInputHistory", () => {
  it("stores trimmed non-empty inputs while avoiding consecutive duplicates", () => {
    expect(appendInputHistory([], "  hello  ")).toEqual(["hello"]);
    expect(appendInputHistory(["hello"], "hello")).toEqual(["hello"]);
    expect(appendInputHistory(["hello"], "next")).toEqual(["hello", "next"]);
    expect(appendInputHistory(["hello"], "   ")).toEqual(["hello"]);
  });

  it("keeps the newest entries within the limit", () => {
    expect(appendInputHistory(["one", "two"], "three", 2)).toEqual(["two", "three"]);
  });
});

describe("useInputHistory", () => {
  it("starts from persisted initial entries", () => {
    const { result } = renderHook(() => useInputHistory({
      initialEntries: ["persisted"],
    }));

    act(() => {
      expect(result.current.previous("draft")).toBe("persisted");
    });
  });

  it("notifies when an input is remembered", () => {
    const onRemember = vi.fn();
    const { result } = renderHook(() => useInputHistory({ onRemember }));

    act(() => {
      result.current.remember("  remembered  ");
    });

    expect(onRemember).toHaveBeenCalledWith("remembered");
  });

  it("navigates previous and next while preserving the current draft", () => {
    const { result } = renderHook(() => useInputHistory());

    act(() => {
      result.current.remember("first");
      result.current.remember("second");
    });

    act(() => {
      expect(result.current.previous("draft")).toBe("second");
    });
    act(() => {
      expect(result.current.previous("second")).toBe("first");
    });
    act(() => {
      expect(result.current.next()).toBe("second");
    });
    act(() => {
      expect(result.current.next()).toBe("draft");
    });
  });

  it("resets navigation when the active input changes", () => {
    const { result } = renderHook(() => useInputHistory());

    act(() => {
      result.current.remember("first");
    });
    act(() => {
      expect(result.current.previous("draft")).toBe("first");
      result.current.resetNavigation("edited");
    });
    act(() => {
      expect(result.current.next()).toBeNull();
    });
    act(() => {
      expect(result.current.previous("edited")).toBe("first");
    });
  });
});

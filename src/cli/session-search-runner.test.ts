import { describe, expect, it, vi } from "vitest";
import type { CLIAppRuntime, CLISessionSearchHit } from "./runtime/types.js";
import {
  formatSessionSearch,
  formatSessionSearchJson,
  runSessionSearch,
} from "./session-search-runner.js";

const hits: CLISessionSearchHit[] = [
  {
    sessionId: "session-1",
    sessionName: "feature work",
    id: "a1",
    index: 2,
    role: "assistant",
    preview: "Cached value updated",
  },
  {
    sessionId: "session-2",
    sessionName: "bugfix",
    id: "u4",
    index: 4,
    role: "user",
    preview: "cache miss",
  },
];

describe("formatSessionSearch", () => {
  it("formats search hits for terminal output", () => {
    expect(formatSessionSearch("cache", hits)).toBe([
      "Search all sessions \"cache\" (2 matches)",
      "feature work (session-1) #2 assistant Cached value updated",
      "bugfix (session-2) #4 user cache miss",
      "",
    ].join("\n"));
  });

  it("formats empty search results", () => {
    expect(formatSessionSearch("missing", [])).toBe("No session matches for \"missing\"\n");
  });
});

describe("formatSessionSearchJson", () => {
  it("formats search hits as json", () => {
    expect(formatSessionSearchJson("cache", hits)).toBe(`${JSON.stringify({
      ok: true,
      query: "cache",
      hits,
    }, null, 2)}\n`);
  });
});

describe("runSessionSearch", () => {
  it("searches sessions, prints text, and destroys the runtime", async () => {
    const runtime = {
      searchSessions: vi.fn(async () => hits),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionSearch(runtime, { stdout, stderr }, { query: "cache" })).resolves.toBe(0);

    expect(runtime.searchSessions).toHaveBeenCalledWith("cache");
    expect(stdout).toHaveBeenCalledWith(formatSessionSearch("cache", hits));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints session search hits as json", async () => {
    const runtime = {
      searchSessions: vi.fn(async () => hits),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionSearch(runtime, { stdout, stderr }, {
      query: "cache",
      output: "json",
    })).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledWith(formatSessionSearchJson("cache", hits));
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });

  it("prints runtime errors as json when requested", async () => {
    const runtime = {
      searchSessions: vi.fn(async () => {
        throw new Error("search unavailable");
      }),
      destroy: vi.fn(async () => undefined),
    } as unknown as CLIAppRuntime;
    const stdout = vi.fn();
    const stderr = vi.fn();

    await expect(runSessionSearch(runtime, { stdout, stderr }, {
      query: "cache",
      output: "json",
    })).resolves.toBe(1);

    expect(stdout).toHaveBeenCalledWith("{\n  \"ok\": false,\n  \"error\": \"search unavailable\"\n}\n");
    expect(stderr).not.toHaveBeenCalled();
    expect(runtime.destroy).toHaveBeenCalled();
  });
});

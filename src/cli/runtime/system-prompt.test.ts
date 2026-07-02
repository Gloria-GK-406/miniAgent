import { describe, expect, it } from "vitest";
import {
  buildEffectiveSystemPrompt,
  getBaseSystemPrompt,
} from "./system-prompt.js";

describe("system prompt helpers", () => {
  it("uses a default base system prompt", () => {
    expect(getBaseSystemPrompt({})).toBe("You are a helpful assistant.");
  });

  it("builds the effective CLI system prompt", () => {
    const prompt = buildEffectiveSystemPrompt({
      baseDir: "C:/repo",
      mode: "plan",
      userSystemPrompt: "Custom prompt.",
    });

    expect(prompt).toContain("Custom prompt.");
    expect(prompt).toContain("Working directory: C:/repo");
    expect(prompt).toContain("Agent mode: plan");
    expect(prompt).toContain("executing shell commands");
  });
});

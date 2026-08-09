import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../../core/index.js";
import { ANTHROPIC_MODEL_PRESETS } from "./models.js";

describe("Anthropic model presets", () => {
  it("includes conservative Claude chat models", () => {
    expect(ANTHROPIC_MODEL_PRESETS.length).toBeGreaterThan(0);
    expect(
      ANTHROPIC_MODEL_PRESETS.some((model) => model.name.includes("claude")),
    ).toBe(true);
    expect(
      ANTHROPIC_MODEL_PRESETS.every((model) =>
        model.thinkingLevels.includes(ThinkingLevel.None),
      ),
    ).toBe(true);
    expect(
      ANTHROPIC_MODEL_PRESETS.every((model) => model.id === model.name),
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../../core/index.js";
import { OPENAI_MODEL_PRESETS } from "./models.js";

describe("OpenAI model presets", () => {
  it("includes conservative OpenAI chat and reasoning models", () => {
    expect(OPENAI_MODEL_PRESETS.length).toBeGreaterThan(0);
    expect(
      OPENAI_MODEL_PRESETS.some((model) => model.name.startsWith("gpt-")),
    ).toBe(true);
    expect(
      OPENAI_MODEL_PRESETS.some((model) => model.name.startsWith("o")),
    ).toBe(true);
    expect(
      OPENAI_MODEL_PRESETS.every((model) =>
        model.thinkingLevels.includes(ThinkingLevel.None),
      ),
    ).toBe(true);
    expect(
      OPENAI_MODEL_PRESETS.every((model) => model.id === model.name),
    ).toBe(true);
  });
});

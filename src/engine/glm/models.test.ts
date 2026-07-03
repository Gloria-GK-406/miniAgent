import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../../core/config.js";
import { GLM_MODEL_PRESETS } from "./models.js";

describe("GLM model presets", () => {
  it("includes source-backed GLM chat models", () => {
    expect(GLM_MODEL_PRESETS.map((model) => model.name)).toEqual([
      "glm-5.2",
      "glm-5.1",
      "glm-5-turbo",
      "glm-5",
      "glm-4.7",
      "glm-4.7-flash",
      "glm-4.7-flashx",
      "glm-4.6",
      "glm-4.5-air",
      "glm-4.5-airx",
      "glm-4.5-flash",
      "glm-4-flash-250414",
      "glm-4-flashx-250414",
    ]);
    expect(
      GLM_MODEL_PRESETS.find((model) => model.name === "glm-5.2")
        ?.maxOutputTokens,
    ).toBe(131072);
    expect(
      GLM_MODEL_PRESETS.find((model) => model.name === "glm-4.5-air")
        ?.maxOutputTokens,
    ).toBe(98304);
    expect(
      GLM_MODEL_PRESETS.find((model) => model.name === "glm-4-flash-250414")
        ?.maxOutputTokens,
    ).toBe(16384);
    expect(
      GLM_MODEL_PRESETS.every((model) =>
        model.thinkingLevels.includes(ThinkingLevel.None),
      ),
    ).toBe(true);
    expect(GLM_MODEL_PRESETS.every((model) => model.id === model.name)).toBe(true);
  });
});

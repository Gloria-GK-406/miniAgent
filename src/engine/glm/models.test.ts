import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../../core/config.js";
import { GLM_MODEL_PRESETS } from "./models.js";

describe("GLM model presets", () => {
  it("includes source-backed GLM chat models", () => {
    expect(GLM_MODEL_PRESETS.some((model) => model.name === "glm-5.2")).toBe(true);
    expect(GLM_MODEL_PRESETS.some((model) => model.name === "glm-4.5-air")).toBe(true);
    expect(
      GLM_MODEL_PRESETS.find((model) => model.name === "glm-5.2")
        ?.maxOutputTokens,
    ).toBe(131072);
    expect(
      GLM_MODEL_PRESETS.find((model) => model.name === "glm-4.5-air")
        ?.maxOutputTokens,
    ).toBe(98304);
    expect(
      GLM_MODEL_PRESETS.every((model) =>
        model.thinkingLevels.includes(ThinkingLevel.None),
      ),
    ).toBe(true);
    expect(GLM_MODEL_PRESETS.every((model) => model.id === model.name)).toBe(true);
  });
});

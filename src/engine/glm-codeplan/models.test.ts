import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../../core/config.js";
import { GLM_CODEPLAN_MODEL_PRESETS } from "./models.js";

describe("GLM CodePlan model presets", () => {
  it("includes source-backed coding plan models", () => {
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.some((model) => model.name === "glm-5.2"),
    ).toBe(true);
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.some((model) => model.name === "glm-5.2[1m]"),
    ).toBe(true);
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.some((model) => model.name.startsWith("glm-4.7")),
    ).toBe(true);
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.some((model) => model.name === "glm-4.7-1m"),
    ).toBe(false);
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.find((model) => model.name === "glm-4.7")
        ?.contextSize,
    ).toBe(200000);
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.find((model) => model.name === "glm-5.2")
        ?.maxOutputTokens,
    ).toBe(131072);
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.find((model) => model.name === "glm-5.2[1m]")
        ?.maxOutputTokens,
    ).toBe(131072);
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.find((model) => model.name === "glm-4.7")
        ?.maxOutputTokens,
    ).toBe(131072);
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.every((model) =>
        model.thinkingLevels.includes(ThinkingLevel.None),
      ),
    ).toBe(true);
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.every((model) => model.id === model.name),
    ).toBe(true);
  });
});

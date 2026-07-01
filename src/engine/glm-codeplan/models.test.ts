import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../../core/config.js";
import { GLM_CODEPLAN_MODEL_PRESETS } from "./models.js";

describe("GLM CodePlan model presets", () => {
  it("includes source-backed coding plan models", () => {
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.some((model) => model.model === "glm-5.2"),
    ).toBe(true);
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.some((model) => model.model.startsWith("glm-4.7")),
    ).toBe(true);
    expect(
      GLM_CODEPLAN_MODEL_PRESETS.every((model) =>
        model.thinkingLevels.includes(ThinkingLevel.None),
      ),
    ).toBe(true);
  });
});

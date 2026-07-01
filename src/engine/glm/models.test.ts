import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../../core/config.js";
import { GLM_MODEL_PRESETS } from "./models.js";

describe("GLM model presets", () => {
  it("includes source-backed GLM chat models", () => {
    expect(GLM_MODEL_PRESETS.some((model) => model.model === "glm-5.2")).toBe(true);
    expect(GLM_MODEL_PRESETS.some((model) => model.model === "glm-4.5-air")).toBe(true);
    expect(
      GLM_MODEL_PRESETS.every((model) =>
        model.thinkingLevels.includes(ThinkingLevel.None),
      ),
    ).toBe(true);
  });
});

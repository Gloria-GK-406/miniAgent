import { describe, expect, it } from "vitest";
import { NVIDIA_MODEL_PRESETS } from "./models.js";

describe("NVIDIA model presets", () => {
  it("leaves the dynamic catalog empty by default", () => {
    expect(NVIDIA_MODEL_PRESETS).toEqual([]);
  });
});

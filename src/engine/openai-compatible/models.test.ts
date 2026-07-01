import { describe, expect, it } from "vitest";
import { OPENAI_COMPATIBLE_MODEL_PRESETS } from "./models.js";

describe("OpenAI-compatible model presets", () => {
  it("does not guess models for arbitrary compatible endpoints", () => {
    expect(OPENAI_COMPATIBLE_MODEL_PRESETS).toEqual([]);
  });
});

import { ThinkingLevel, type ModelPreset } from "../../core/config.js";

export const OPENAI_MODEL_PRESETS: ModelPreset[] = [
  {
    model: "gpt-4o",
    displayName: "GPT-4o",
    thinkingLevels: [ThinkingLevel.None],
  },
  {
    model: "gpt-4.1",
    displayName: "GPT-4.1",
    thinkingLevels: [ThinkingLevel.None],
  },
  {
    model: "o3",
    displayName: "o3",
    thinkingLevels: [
      ThinkingLevel.None,
      ThinkingLevel.Low,
      ThinkingLevel.Medium,
      ThinkingLevel.High,
    ],
  },
  {
    model: "o4-mini",
    displayName: "o4 Mini",
    thinkingLevels: [
      ThinkingLevel.None,
      ThinkingLevel.Low,
      ThinkingLevel.Medium,
      ThinkingLevel.High,
    ],
  },
];

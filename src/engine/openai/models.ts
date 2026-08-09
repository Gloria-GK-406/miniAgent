import { ThinkingLevel, type ModelPreset } from "../../core/index.js";

export const OPENAI_MODEL_PRESETS: ModelPreset[] = [
  {
    id: "gpt-4o",
    name: "gpt-4o",
    displayName: "GPT-4o",
    thinkingLevels: [ThinkingLevel.None],
  },
  {
    id: "gpt-4.1",
    name: "gpt-4.1",
    displayName: "GPT-4.1",
    thinkingLevels: [ThinkingLevel.None],
  },
  {
    id: "o3",
    name: "o3",
    displayName: "o3",
    thinkingLevels: [
      ThinkingLevel.None,
      ThinkingLevel.Low,
      ThinkingLevel.Medium,
      ThinkingLevel.High,
    ],
  },
  {
    id: "o4-mini",
    name: "o4-mini",
    displayName: "o4 Mini",
    thinkingLevels: [
      ThinkingLevel.None,
      ThinkingLevel.Low,
      ThinkingLevel.Medium,
      ThinkingLevel.High,
    ],
  },
];

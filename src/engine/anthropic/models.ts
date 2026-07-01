import { ThinkingLevel, type ModelPreset } from "../../core/config.js";

export const ANTHROPIC_MODEL_PRESETS: ModelPreset[] = [
  {
    model: "claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5",
    thinkingLevels: [
      ThinkingLevel.None,
      ThinkingLevel.Low,
      ThinkingLevel.Medium,
      ThinkingLevel.High,
      ThinkingLevel.Max,
    ],
  },
  {
    model: "claude-opus-4-1",
    displayName: "Claude Opus 4.1",
    thinkingLevels: [
      ThinkingLevel.None,
      ThinkingLevel.Low,
      ThinkingLevel.Medium,
      ThinkingLevel.High,
      ThinkingLevel.Max,
    ],
  },
  {
    model: "claude-3-haiku-20240307",
    displayName: "Claude 3 Haiku",
    thinkingLevels: [ThinkingLevel.None],
  },
];

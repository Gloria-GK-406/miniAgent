import { ThinkingLevel, type ModelPreset } from "../../core/index.js";

export const ANTHROPIC_MODEL_PRESETS: ModelPreset[] = [
  {
    id: "claude-sonnet-4-5",
    name: "claude-sonnet-4-5",
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
    id: "claude-opus-4-1",
    name: "claude-opus-4-1",
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
    id: "claude-3-haiku-20240307",
    name: "claude-3-haiku-20240307",
    displayName: "Claude 3 Haiku",
    thinkingLevels: [ThinkingLevel.None],
  },
];

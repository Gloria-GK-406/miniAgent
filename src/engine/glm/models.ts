import { ThinkingLevel, type ModelPreset } from "../../core/config.js";

export const GLM_MODEL_PRESETS: ModelPreset[] = [
  {
    model: "glm-5.2",
    displayName: "GLM 5.2",
    contextSize: 1000000,
    maxOutputTokens: 131072,
    thinkingLevels: [
      ThinkingLevel.None,
      ThinkingLevel.Low,
      ThinkingLevel.Medium,
      ThinkingLevel.High,
      ThinkingLevel.Max,
    ],
  },
  {
    model: "glm-4.5-air",
    displayName: "GLM 4.5 Air",
    contextSize: 128000,
    maxOutputTokens: 98304,
    thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
  },
];

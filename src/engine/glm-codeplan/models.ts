import { ThinkingLevel, type ModelPreset } from "../../core/config.js";

export const GLM_CODEPLAN_MODEL_PRESETS: ModelPreset[] = [
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
    model: "glm-5.2[1m]",
    displayName: "GLM 5.2 1M",
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
    model: "glm-4.7",
    displayName: "GLM 4.7",
    contextSize: 200000,
    maxOutputTokens: 131072,
    thinkingLevels: [ThinkingLevel.None, ThinkingLevel.Medium],
  },
];

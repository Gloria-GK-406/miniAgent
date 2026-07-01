import { ThinkingLevel, type ModelPreset } from "../../core/config.js";

export const GLM_CODEPLAN_MODEL_PRESETS: ModelPreset[] = [
  {
    model: "glm-5.2",
    displayName: "GLM 5.2",
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
    thinkingLevels: [
      ThinkingLevel.None,
      ThinkingLevel.Low,
      ThinkingLevel.Medium,
      ThinkingLevel.High,
      ThinkingLevel.Max,
    ],
  },
  {
    model: "glm-4.7-1m",
    displayName: "GLM 4.7 1M",
    contextSize: 1000000,
    thinkingLevels: [
      ThinkingLevel.None,
      ThinkingLevel.Low,
      ThinkingLevel.Medium,
      ThinkingLevel.High,
      ThinkingLevel.Max,
    ],
  },
];

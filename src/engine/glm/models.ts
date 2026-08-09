import { ThinkingLevel, type ModelPreset } from "../../core/index.js";

const GLM_FULL_THINKING_LEVELS = [
  ThinkingLevel.None,
  ThinkingLevel.Low,
  ThinkingLevel.Medium,
  ThinkingLevel.High,
  ThinkingLevel.Max,
];

const GLM_BASIC_THINKING_LEVELS = [ThinkingLevel.None, ThinkingLevel.Medium];
const GLM_NO_THINKING_LEVELS = [ThinkingLevel.None];

function createGLMPreset(
  name: string,
  displayName: string,
  contextSize: number,
  maxOutputTokens: number,
  thinkingLevels = GLM_BASIC_THINKING_LEVELS,
): ModelPreset {
  return {
    id: name,
    name,
    displayName,
    contextSize,
    maxOutputTokens,
    thinkingLevels: [...thinkingLevels],
  };
}

export const GLM_MODEL_PRESETS: ModelPreset[] = [
  createGLMPreset("glm-5.2", "GLM 5.2", 1000000, 131072, GLM_FULL_THINKING_LEVELS),
  createGLMPreset("glm-5.1", "GLM 5.1", 200000, 131072),
  createGLMPreset("glm-5-turbo", "GLM 5 Turbo", 200000, 131072),
  createGLMPreset("glm-5", "GLM 5", 200000, 131072),
  createGLMPreset("glm-4.7", "GLM 4.7", 200000, 131072),
  createGLMPreset("glm-4.7-flash", "GLM 4.7 Flash", 200000, 131072),
  createGLMPreset("glm-4.7-flashx", "GLM 4.7 FlashX", 200000, 131072),
  createGLMPreset("glm-4.6", "GLM 4.6", 200000, 131072),
  createGLMPreset("glm-4.5-air", "GLM 4.5 Air", 128000, 98304),
  createGLMPreset("glm-4.5-airx", "GLM 4.5 AirX", 128000, 98304),
  createGLMPreset("glm-4.5-flash", "GLM 4.5 Flash", 128000, 98304),
  createGLMPreset(
    "glm-4-flash-250414",
    "GLM 4 Flash 250414",
    128000,
    16384,
    GLM_NO_THINKING_LEVELS,
  ),
  createGLMPreset(
    "glm-4-flashx-250414",
    "GLM 4 FlashX 250414",
    128000,
    16384,
    GLM_NO_THINKING_LEVELS,
  ),
];

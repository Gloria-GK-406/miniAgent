import { describe, expect, it } from "vitest";
import { CONNECT_PROVIDER_OPTIONS, buildProviderConnection } from "./provider-catalog.js";

describe("provider catalog", () => {
  it("includes the /connect provider choices", () => {
    expect(CONNECT_PROVIDER_OPTIONS.map((provider) => provider.label)).toEqual([
      "OpenAI",
      "Anthropic Claude",
      "Zhipu GLM",
      "Zhipu GLM CodePlan",
      "NVIDIA",
      "Other Custom provider",
    ]);
  });

  it("builds a preset-backed provider connection from an API key", () => {
    const connection = buildProviderConnection({
      providerId: "openai",
      apiKey: "sk-test",
    });

    expect(connection.engine).toBe("openai");
    expect(connection.defaultModel).toBe("openai/gpt-4o");
    expect(connection.models.length).toBeGreaterThan(0);
  });

  it("requires base URL and model id for custom providers", () => {
    expect(() => buildProviderConnection({
      providerId: "custom",
      apiKey: "sk-test",
      modelId: "custom-model",
    })).toThrow("Base URL is required");
    expect(() => buildProviderConnection({
      providerId: "custom",
      apiKey: "sk-test",
      baseURL: "https://api.example.test/v1",
    })).toThrow("Model id is required");

    expect(buildProviderConnection({
      providerId: "custom",
      apiKey: "sk-test",
      baseURL: "https://api.example.test/v1",
      modelId: "custom-model",
    })).toEqual(expect.objectContaining({
      engine: "openai-compatible",
      baseURL: "https://api.example.test/v1",
      defaultModel: "openai-compatible/custom-model",
      models: [expect.objectContaining({ id: "custom-model", name: "custom-model" })],
    }));
  });
});

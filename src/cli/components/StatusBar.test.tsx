import { describe, it, expect } from "vitest";
import { renderToString } from "ink";
import { StatusBar } from "./StatusBar.js";

describe("StatusBar", () => {
  it("renders model name", () => {
    const output = renderToString(
      <StatusBar
        modelName="anthropic/claude-sonnet-4"
        hitlEnabled={false}
        tokenUsage={{ input: 100, output: 200, total: 300 }}
      />,
    );
    expect(output).toContain("anthropic/claude-sonnet-4");
  });

  it("renders HITL enabled", () => {
    const output = renderToString(
      <StatusBar
        modelName="test/model"
        hitlEnabled={true}
        tokenUsage={{ input: 0, output: 0, total: 0 }}
      />,
    );
    expect(output).toContain("HITL");
  });

  it("renders HITL disabled", () => {
    const output = renderToString(
      <StatusBar
        modelName="test/model"
        hitlEnabled={false}
        tokenUsage={{ input: 0, output: 0, total: 0 }}
      />,
    );
    expect(output).toContain("HITL");
  });

  it("renders session name", () => {
    const output = renderToString(
      <StatusBar
        modelName="test/model"
        sessionName="my-session"
        hitlEnabled={false}
        tokenUsage={{ input: 0, output: 0, total: 0 }}
      />,
    );
    expect(output).toContain("my-session");
  });

  it("formats token usage with k suffix for large numbers", () => {
    const output = renderToString(
      <StatusBar
        modelName="test/model"
        hitlEnabled={false}
        tokenUsage={{ input: 1200, output: 3400, total: 4600 }}
      />,
    );
    expect(output).toContain("1.2k in");
    expect(output).toContain("3.4k out");
    expect(output).toContain("4.6k total");
  });

  it("formats token usage without k suffix for small numbers", () => {
    const output = renderToString(
      <StatusBar
        modelName="test/model"
        hitlEnabled={false}
        tokenUsage={{ input: 100, output: 200, total: 300 }}
      />,
    );
    expect(output).toContain("100 in");
    expect(output).toContain("200 out");
    expect(output).toContain("300 total");
  });
});

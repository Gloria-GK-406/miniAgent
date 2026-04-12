import { describe, expect, it } from "vitest";
import { renderToString } from "ink";
import { ModelSelectView } from "./ModelSelectView.js";

describe("ModelSelectView", () => {
  it("renders model list and active model", () => {
    const output = renderToString(
      <ModelSelectView
        modelPaths={["anthropic/claude-sonnet-4", "openai/gpt-4.1"]}
        currentModelPath="anthropic/claude-sonnet-4"
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    expect(output).toContain("Models");
    expect(output).toContain("anthropic/claude-sonnet-4");
    expect(output).toContain("openai/gpt-4.1");
    expect(output).toContain("(active)");
  });

  it("renders selection controls", () => {
    const output = renderToString(
      <ModelSelectView
        modelPaths={["anthropic/claude-sonnet-4", "openai/gpt-4.1"]}
        currentModelPath="anthropic/claude-sonnet-4"
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );

    expect(output).toContain("Enter switch");
    expect(output).toContain("ESC close");
    expect(output).toContain("› ");
  });
});
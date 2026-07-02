import { describe, expect, it, vi } from "vitest";
import { renderToString } from "ink";
import { SystemPromptView } from "./SystemPromptView.js";

describe("SystemPromptView", () => {
  it("renders base and effective system prompts", () => {
    const output = renderToString(
      <SystemPromptView
        basePrompt="Base prompt."
        effectivePrompt={[
          "Base prompt.",
          "",
          "Working directory: C:/repo",
          "Agent mode: build",
        ].join("\n")}
        onClose={vi.fn()}
      />,
    );

    expect(output).toContain("System Prompt");
    expect(output).toContain("Base prompt.");
    expect(output).toContain("Working directory: C:/repo");
    expect(output).toContain("Agent mode: build");
  });
});

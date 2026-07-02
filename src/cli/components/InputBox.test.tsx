import { describe, it, expect } from "vitest";
import { renderToString } from "ink";
import { InputBox, resolveTabInputAction } from "./InputBox.js";

describe("InputBox", () => {
  it("renders prompt symbol", () => {
    const output = renderToString(<InputBox onSubmit={() => {}} />);
    expect(output).toContain(">");
    expect(output).toContain("|");
    expect(output).not.toContain("❯");
    expect(output).not.toContain("█");
  });

  it("renders placeholder when disabled", () => {
    const output = renderToString(
      <InputBox
        onSubmit={() => {}}
        disabled={true}
        placeholder="Waiting for response..."
      />,
    );
    expect(output).toContain(">");
    expect(output).toContain("Waiting for response...");
    expect(output).not.toContain("❯");
  });

  it("renders empty when disabled without placeholder", () => {
    const output = renderToString(
      <InputBox onSubmit={() => {}} disabled={true} />,
    );
    expect(output).toContain(">");
    expect(output).not.toContain("❯");
  });

  it("renders enabled state with prompt", () => {
    const output = renderToString(<InputBox onSubmit={() => {}} />);
    expect(output).toContain(">");
    expect(output).toContain("|");
    expect(output).not.toContain("❯");
  });
  it("uses Tab for completion before mode switching", () => {
    expect(resolveTabInputAction("/he", () => "/help ")).toEqual({
      type: "complete",
      value: "/help ",
    });
    expect(resolveTabInputAction("plain", () => null)).toEqual({
      type: "toggle-mode",
    });
  });
});

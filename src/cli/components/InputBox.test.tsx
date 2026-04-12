import { describe, it, expect } from "vitest";
import { renderToString } from "ink";
import { InputBox } from "./InputBox.js";

describe("InputBox", () => {
  it("renders prompt symbol", () => {
    const output = renderToString(<InputBox onSubmit={() => {}} />);
    expect(output).toContain("❯");
  });

  it("renders placeholder when disabled", () => {
    const output = renderToString(
      <InputBox
        onSubmit={() => {}}
        disabled={true}
        placeholder="Waiting for response..."
      />,
    );
    expect(output).toContain("❯");
    expect(output).toContain("Waiting for response...");
  });

  it("renders empty when disabled without placeholder", () => {
    const output = renderToString(
      <InputBox onSubmit={() => {}} disabled={true} />,
    );
    expect(output).toContain("❯");
  });

  it("renders enabled state with prompt", () => {
    const output = renderToString(<InputBox onSubmit={() => {}} />);
    expect(output).toContain("❯");
  });
});

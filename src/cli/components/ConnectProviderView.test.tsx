import { renderToString } from "ink";
import { describe, expect, it } from "vitest";
import { ConnectProviderView } from "./ConnectProviderView.js";

describe("ConnectProviderView", () => {
  it("renders provider selection for /connect", () => {
    const output = renderToString(
      <ConnectProviderView
        onConnect={() => {}}
        onClose={() => {}}
      />,
    );

    expect(output).toContain("Connect a provider");
    expect(output).toContain("Search");
    expect(output).toContain("Anthropic Claude");
    expect(output).toContain("Other Custom provider");
    expect(output).toContain("Enter select | ESC close");
    expect(output).not.toContain("鈥?");
    expect(output).not.toContain("鈹€");
  });
});

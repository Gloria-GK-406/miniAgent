import { describe, expect, it } from "vitest";
import { renderToString } from "ink";
import { MessageType } from "../../core/index.js";
import type { Message } from "../../core/index.js";
import { PanelView } from "./PanelView.js";

describe("PanelView", () => {
  it("renders ASCII separators and controls", () => {
    const messages: Message[] = Array.from({ length: 30 }, (_, index) => ({
      id: `m${index}`,
      type: MessageType.User,
      content: `message ${index}`,
    }));

    const output = renderToString(
      <PanelView
        data={{ title: "History", messages }}
        onClose={() => {}}
      />,
    );

    expect(output).toContain("----------------------------------------");
    expect(output).toContain("down more below");
    expect(output).toContain("ESC close | Up/Down scroll | PgUp/PgDn page");
    expect(output).not.toContain("↓");
    expect(output).not.toContain("↑");
    expect(output).not.toContain("·");
    expect(output).not.toContain("─");
  });
});

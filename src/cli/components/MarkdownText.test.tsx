import { Console } from "node:console";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { render } from "ink";
import type { Instance } from "ink";
import React from "react";
import { MarkdownText } from "./MarkdownText.js";

const _savedConsole = globalThis.console;
beforeAll(() => {
  Object.assign(globalThis.console, { Console });
});
afterAll(() => {
  Object.assign(globalThis.console, { Console: _savedConsole.Console });
});

function renderToBuffer(element: React.ReactElement): string {
  let buffer = "";
  const stdout = {
    write: (s: string) => {
      buffer += s;
      return true;
    },
    columns: 80,
  } as unknown as NodeJS.WriteStream;
  const result: Instance = render(element, { stdout });
  result.unmount();
  return buffer;
}

describe("MarkdownText", () => {
  it("renders plain text", () => {
    const output = renderToBuffer(<MarkdownText text="Hello world" />);
    expect(output).toContain("Hello world");
  });

  it("renders bold text", () => {
    const output = renderToBuffer(<MarkdownText text="This is **bold** text" />);
    expect(output).toContain("bold");
    expect(output).toContain("This is");
    expect(output).toContain("text");
  });

  it("renders inline code", () => {
    const output = renderToBuffer(
      <MarkdownText text="Use `console.log()` to debug" />,
    );
    expect(output).toContain("console.log()");
  });

  it("renders code block", () => {
    const output = renderToBuffer(
      <MarkdownText text={"```typescript\nconst x = 1;\n```"} />,
    );
    expect(output).toContain("const x = 1");
  });

  it("renders code block with language label", () => {
    const output = renderToBuffer(
      <MarkdownText text={"```typescript\nconst x = 1;\n```"} />,
    );
    expect(output).toContain("typescript");
  });

  it("handles empty input", () => {
    const output = renderToBuffer(<MarkdownText text="" />);
    expect(output.trim()).toBe("");
  });

  it("renders mixed content with bold, code, and plain text", () => {
    const output = renderToBuffer(
      <MarkdownText text="Use **bold** and `code` together" />,
    );
    expect(output).toContain("bold");
    expect(output).toContain("code");
    expect(output).toContain("Use");
    expect(output).toContain("together");
  });

  it("renders multiple paragraphs", () => {
    const output = renderToBuffer(
      <MarkdownText text={"First paragraph\n\nSecond paragraph"} />,
    );
    expect(output).toContain("First paragraph");
    expect(output).toContain("Second paragraph");
  });

  it("renders list items", () => {
    const output = renderToBuffer(
      <MarkdownText text={"- item1\n- item2\n- item3"} />,
    );
    expect(output).toContain("item1");
    expect(output).toContain("item2");
    expect(output).toContain("item3");
  });

  it("renders null for empty string", () => {
    let buffer = "";
    const stdout = {
      write: (s: string) => {
        buffer += s;
        return true;
      },
      columns: 80,
    } as unknown as NodeJS.WriteStream;
    const result = render(<MarkdownText text="" />, { stdout });
    result.unmount();
    expect(buffer.trim()).toBe("");
  });

  it("renders nested bold with inline code", () => {
    const output = renderToBuffer(
      <MarkdownText text="**`important`** value" />,
    );
    expect(output).toContain("important");
    expect(output).toContain("value");
  });

  it("renders code block without language", () => {
    const output = renderToBuffer(
      <MarkdownText text={"```\nplain code\n```"} />,
    );
    expect(output).toContain("plain code");
  });

  it("preserves plain text unchanged", () => {
    const output = renderToBuffer(
      <MarkdownText text="No special markdown here" />,
    );
    expect(output).toContain("No special markdown here");
  });
});

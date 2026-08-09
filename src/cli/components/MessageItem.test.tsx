import { describe, it, expect } from "vitest";
import { renderToString } from "ink";
import { MessageItem } from "./MessageItem.js";
import type { Message } from "../../core/index.js";
import { MessageType } from "../../core/index.js";

describe("MessageItem", () => {
  it("renders User message with ASCII prompt and text", () => {
    const msg: Message = {
      id: "1",
      type: MessageType.User,
      content: "Hello world",
    };
    const output = renderToString(<MessageItem message={msg} />);
    expect(output).toContain(">");
    expect(output).toContain("Hello world");
    expect(output).not.toContain("❯");
  });

  it("renders Assist message with content", () => {
    const msg: Message = {
      id: "2",
      type: MessageType.Assist,
      content: "I am a response",
    };
    const output = renderToString(<MessageItem message={msg} />);
    expect(output).toContain("I am a response");
  });

  it("renders Assist message with streaming text appended", () => {
    const msg: Message = {
      id: "3",
      type: MessageType.Assist,
      content: "Hello ",
    };
    const output = renderToString(
      <MessageItem message={msg} streamingText="world" />,
    );
    expect(output).toContain("Hello ");
    expect(output).toContain("world");
  });

  it("renders Assist message with reasoning content", () => {
    const msg: Message = {
      id: "3b",
      type: MessageType.Assist,
      content: "The answer",
      reasoningContent: "Let me think...",
    };
    const output = renderToString(<MessageItem message={msg} />);
    expect(output).toContain("The answer");
    expect(output).toContain("Let me think...");
  });

  it("renders ToolCall collapsed with tool name only", () => {
    const msg: Message = {
      id: "4",
      type: MessageType.ToolCall,
      content: "",
      toolCallId: "tc-1",
      toolName: "read_file",
      arguments: { path: "/some/file.ts" },
    };
    const output = renderToString(
      <MessageItem message={msg} collapsed={true} />,
    );
    expect(output).toContain("read_file");
    expect(output).toContain("$");
    expect(output).not.toContain("⟳");
  });

  it("renders ToolCall expanded with arguments", () => {
    const msg: Message = {
      id: "4b",
      type: MessageType.ToolCall,
      content: "",
      toolCallId: "tc-2",
      toolName: "read_file",
      arguments: { path: "/some/file.ts" },
    };
    const output = renderToString(
      <MessageItem message={msg} collapsed={false} />,
    );
    expect(output).toContain("read_file");
    expect(output).toContain("path");
  });

  it("renders ToolResult with ASCII output marker", () => {
    const msg: Message = {
      id: "5",
      type: MessageType.ToolResult,
      content: "file contents here",
      toolCallId: "tc-1",
    };
    const output = renderToString(<MessageItem message={msg} />);
    expect(output).toContain("<");
    expect(output).toContain("file contents here");
    expect(output).not.toContain("→");
  });

  it("renders ToolResult collapsed shows only first line", () => {
    const msg: Message = {
      id: "5b",
      type: MessageType.ToolResult,
      content: "first line\nsecond line\nthird line",
      toolCallId: "tc-3",
    };
    const output = renderToString(
      <MessageItem message={msg} collapsed={true} />,
    );
    expect(output).toContain("first line");
    expect(output).not.toContain("second line");
  });

  it("renders ToolResult expanded shows all lines", () => {
    const msg: Message = {
      id: "5c",
      type: MessageType.ToolResult,
      content: "first line\nsecond line\nthird line",
      toolCallId: "tc-4",
    };
    const output = renderToString(
      <MessageItem message={msg} collapsed={false} />,
    );
    expect(output).toContain("first line");
    expect(output).toContain("second line");
    expect(output).toContain("third line");
  });

  it("renders System message", () => {
    const msg: Message = {
      id: "6",
      type: MessageType.System,
      content: "System instruction",
    };
    const output = renderToString(<MessageItem message={msg} />);
    expect(output).toContain("System instruction");
  });
});

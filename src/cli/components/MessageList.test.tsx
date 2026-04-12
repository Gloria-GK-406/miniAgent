import { describe, it, expect } from "vitest";
import { renderToString } from "ink";
import { MessageList } from "./MessageList.js";
import { MessageType } from "../../core/types.js";
import type { Message } from "../../core/types.js";

describe("MessageList", () => {
  it("renders multiple messages", () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "Hello" },
      { id: "2", type: MessageType.Assist, content: "Hi there" },
      { id: "3", type: MessageType.User, content: "How are you?" },
    ];
    const output = renderToString(
      <MessageList messages={messages} />,
    );
    expect(output).toContain("Hello");
    expect(output).toContain("Hi there");
    expect(output).toContain("How are you?");
  });

  it("renders empty list without crashing", () => {
    const output = renderToString(<MessageList messages={[]} />);
    expect(output).toBeDefined();
  });

  it("passes streamingText to last assist message", () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "Hello" },
      { id: "2", type: MessageType.Assist, content: "Let me think" },
    ];
    const output = renderToString(
      <MessageList messages={messages} streamingText="...more" />,
    );
    expect(output).toContain("Let me think");
    expect(output).toContain("...more");
  });

  it("does not pass streamingText to non-last messages", () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.Assist, content: "First" },
      { id: "2", type: MessageType.User, content: "Hello" },
    ];
    const output = renderToString(
      <MessageList messages={messages} streamingText="stream" />,
    );
    expect(output).toContain("First");
    expect(output).not.toContain("stream");
  });

  it("renders tool call messages", () => {
    const messages: Message[] = [
      {
        id: "1",
        type: MessageType.User,
        content: "Read the file",
      },
      {
        id: "2",
        type: MessageType.ToolCall,
        content: "",
        toolCallId: "tc1",
        toolName: "read",
        arguments: { path: "/tmp/test.txt" },
      },
      {
        id: "3",
        type: MessageType.ToolResult,
        content: "file contents here",
        toolCallId: "tc1",
      },
    ];
    const output = renderToString(
      <MessageList messages={messages} />,
    );
    expect(output).toContain("read");
    expect(output).toContain("file contents here");
  });
});

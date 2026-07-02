import { describe, it, expect } from "vitest";
import { renderToString } from "ink";
import { MessageList, buildRenderableLines, buildRenderableMessages } from "./MessageList.js";
import { MessageType } from "../../core/types.js";
import type { Message } from "../../core/types.js";

describe("MessageList", () => {
  it("adds a temporary assist message for streaming text after a user message", () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.User, content: "Hello" },
    ];
    const rendered = buildRenderableMessages(messages, "stream", "think");
    expect(rendered).toHaveLength(2);
    expect(rendered[1]).toMatchObject({
      type: MessageType.Assist,
      content: "",
    });
  });

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

  it("renders a temporary assist row when streaming after a non-assist message", () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.Assist, content: "First" },
      { id: "2", type: MessageType.User, content: "Hello" },
    ];
    const output = renderToString(
      <MessageList messages={messages} streamingText="stream" />,
    );
    expect(output).toContain("First");
    expect(output).toContain("Hello");
    expect(output).toContain("stream");
  });

  it("does not render a temporary assist row when no streaming content exists", () => {
    const messages: Message[] = [
      { id: "1", type: MessageType.Assist, content: "First" },
      { id: "2", type: MessageType.User, content: "Hello" },
    ];
    const output = renderToString(
      <MessageList messages={messages} />,
    );
    expect(output).toContain("First");
    expect(output).toContain("Hello");
    expect(output).not.toContain("__streaming_tail__");
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
    expect(output).toContain("> Read the file");
    expect(output).toContain("$ read");
    expect(output).toContain("< file contents here");
    expect(output).toContain("read");
    expect(output).toContain("file contents here");
    expect(output).not.toContain("❯");
    expect(output).not.toContain("⟳");
    expect(output).not.toContain("→");
  });

  it("truncates tool result to the first line preview", () => {
    const messages: Message[] = [
      {
        id: "1",
        type: MessageType.ToolResult,
        content: "first line\nsecond line\nthird line",
        toolCallId: "tc1",
      },
    ];
    const output = renderToString(
      <MessageList messages={messages} />,
    );
    expect(output).toContain("first line");
    expect(output).not.toContain("second line");
    expect(output).not.toContain("third line");
  });

  it("hides reasoning unless reasoning visibility is enabled", () => {
    const messages: Message[] = [
      {
        id: "1",
        type: MessageType.Assist,
        content: "Answer",
        reasoningContent: "private reasoning",
      },
    ];

    expect(buildRenderableLines(
      messages,
      undefined,
      "streaming reasoning",
      80,
      { showReasoning: false },
    ).map((line) => line.text).join("\n")).not.toContain("private reasoning");
    expect(buildRenderableLines(
      messages,
      undefined,
      "streaming reasoning",
      80,
      { showReasoning: true },
    ).map((line) => line.text).join("\n")).toContain("? streaming reasoning");
  });

  it("hides tool details until detail visibility is enabled", () => {
    const messages: Message[] = [
      {
        id: "1",
        type: MessageType.ToolCall,
        content: "",
        toolCallId: "tc1",
        toolName: "read",
        arguments: { path: "secret.txt" },
      },
      {
        id: "2",
        type: MessageType.ToolResult,
        content: "first line\nsecond line",
        toolCallId: "tc1",
      },
    ];

    const compact = buildRenderableLines(
      messages,
      undefined,
      undefined,
      80,
      { showToolDetails: false },
    ).map((line) => line.text).join("\n");
    const detailed = buildRenderableLines(
      messages,
      undefined,
      undefined,
      80,
      { showToolDetails: true },
    ).map((line) => line.text).join("\n");

    expect(compact).toContain("read");
    expect(compact).not.toContain("secret.txt");
    expect(compact).toContain("first line");
    expect(compact).not.toContain("second line");
    expect(detailed).toContain("secret.txt");
    expect(detailed).toContain("second line");
  });
});

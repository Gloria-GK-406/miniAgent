import { describe, it, expect } from "vitest";
import { renderToString } from "ink";
import { ApprovalPrompt } from "./ApprovalPrompt.js";

describe("ApprovalPrompt", () => {
  it("renders tool name", () => {
    const output = renderToString(
      <ApprovalPrompt
        toolName="read_file"
        args={{ path: "/tmp/test.txt" }}
        onDecision={() => {}}
      />,
    );
    expect(output).toContain("read_file");
  });

  it("renders args as JSON", () => {
    const output = renderToString(
      <ApprovalPrompt
        toolName="bash"
        args={{ command: "ls -la" }}
        onDecision={() => {}}
      />,
    );
    expect(output).toContain("ls -la");
    expect(output).toContain("command");
  });

  it("renders approval options", () => {
    const output = renderToString(
      <ApprovalPrompt
        toolName="bash"
        args={{}}
        onDecision={() => {}}
      />,
    );
    expect(output).toContain("Approval required");
    expect(output).toContain("[y]es");
    expect(output).toContain("[n]o");
    expect(output).toContain("Enter");
    expect(output).toContain("Esc");
    expect(output).not.toContain("[a]lways");
  });

  it("truncates long args", () => {
    const longArg = "x".repeat(600);
    const output = renderToString(
      <ApprovalPrompt
        toolName="write_file"
        args={{ content: longArg }}
        onDecision={() => {}}
      />,
    );
    expect(output).toContain("...");
  });

  it("does not truncate short args", () => {
    const output = renderToString(
      <ApprovalPrompt
        toolName="read_file"
        args={{ path: "/tmp/test.txt" }}
        onDecision={() => {}}
      />,
    );
    expect(output).toContain("/tmp/test.txt");
    expect(output).not.toMatch(/\.{3}$/);
  });
});

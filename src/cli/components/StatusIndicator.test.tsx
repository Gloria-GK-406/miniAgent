import { describe, it, expect } from "vitest";
import { renderToString } from "ink";
import { StatusIndicator } from "./StatusIndicator.js";

describe("StatusIndicator", () => {
  it("shows Thinking when running without tool", () => {
    const output = renderToString(
      <StatusIndicator
        isRunning={true}
        currentTool={null}
        turnCount={1}
        error={null}
      />,
    );
    expect(output).toContain("Thinking");
  });

  it("shows Executing with tool name when running with tool", () => {
    const output = renderToString(
      <StatusIndicator
        isRunning={true}
        currentTool="read_file"
        turnCount={2}
        error={null}
      />,
    );
    expect(output).toContain("Executing");
    expect(output).toContain("read_file");
  });

  it("shows error message when not running with error", () => {
    const output = renderToString(
      <StatusIndicator
        isRunning={false}
        currentTool={null}
        turnCount={3}
        error="Something went wrong"
      />,
    );
    expect(output).toContain("Error");
    expect(output).toContain("Something went wrong");
  });

  it("shows Ready when idle", () => {
    const output = renderToString(
      <StatusIndicator
        isRunning={false}
        currentTool={null}
        turnCount={5}
        error={null}
      />,
    );
    expect(output).toContain("Ready");
  });

  it("shows turn count", () => {
    const output = renderToString(
      <StatusIndicator
        isRunning={false}
        currentTool={null}
        turnCount={42}
        error={null}
      />,
    );
    expect(output).toContain("Turn 42");
  });
});

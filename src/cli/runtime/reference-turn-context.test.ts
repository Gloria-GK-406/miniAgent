import { describe, expect, it } from "vitest";
import { MessageType } from "../../core/index.js";
import {
  createReferenceTurnContextAppender,
  createReferenceTurnContextMessages,
} from "./reference-turn-context.js";
import type { ResolvedReference } from "./reference-service.js";

function ref(overrides: Partial<ResolvedReference>): ResolvedReference {
  return {
    token: overrides.token ?? "@src/a.ts",
    path: overrides.path ?? "/repo/src/a.ts",
    displayPath: overrides.displayPath ?? "src/a.ts",
    content: overrides.content ?? "const a = 1;",
    ...(overrides.startLine !== undefined && { startLine: overrides.startLine }),
    ...(overrides.endLine !== undefined && { endLine: overrides.endLine }),
  };
}

describe("reference turn context", () => {
  it("renders referenced files as a transient system context message", () => {
    expect(createReferenceTurnContextMessages([
      ref({ startLine: 2, endLine: 3, content: "two\nthree" }),
    ])).toEqual([{
      id: "cli-reference-context",
      type: MessageType.System,
      content: [
        "[Referenced files]",
        "File: src/a.ts:2-3",
        "```",
        "two\nthree",
        "```",
      ].join("\n"),
    }]);
  });

  it("returns no context messages when there are no references", () => {
    expect(createReferenceTurnContextMessages([])).toEqual([]);
  });

  it("stores and clears transient reference context for a run", async () => {
    const context = createReferenceTurnContextAppender();

    await expect(context.appendTurnContext()).resolves.toEqual([]);

    context.setReferences([ref({ content: "body" })]);
    await expect(context.appendTurnContext()).resolves.toEqual(
      createReferenceTurnContextMessages([ref({ content: "body" })]),
    );

    context.clear();
    await expect(context.appendTurnContext()).resolves.toEqual([]);
  });
});

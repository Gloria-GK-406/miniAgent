import { z } from "zod";
import { MessageType, type Message } from "../../core/index.js";
import { TurnContextAppenderSchema, type TurnContextAppender } from "../../core/index.js";
import type { ResolvedReference } from "./reference-service.js";

function formatReferenceRange(ref: ResolvedReference): string {
  if (ref.startLine === undefined) {
    return "";
  }
  const endLine = ref.endLine ?? ref.startLine;
  return `:${ref.startLine}${endLine !== ref.startLine ? `-${endLine}` : ""}`;
}

function renderReferences(references: ResolvedReference[]): string {
  const blocks = references.flatMap((ref) => [
    `File: ${ref.displayPath}${formatReferenceRange(ref)}`,
    "```",
    ref.content,
    "```",
  ]);
  return ["[Referenced files]", ...blocks].join("\n");
}

export function createReferenceTurnContextMessages(
  references: ResolvedReference[],
): Message[] {
  if (references.length === 0) {
    return [];
  }
  return [{
    id: "cli-reference-context",
    type: MessageType.System,
    content: renderReferences(references),
  }];
}

export const ReferenceTurnContextAppenderSchema = z.intersection(z.lazy(() => TurnContextAppenderSchema), z.custom<{
  setReferences(references: ResolvedReference[]): void;
  clear(): void;
}>()) as z.ZodType<TurnContextAppender & {
  setReferences(references: ResolvedReference[]): void;
  clear(): void;
}>;
export type ReferenceTurnContextAppender = z.infer<typeof ReferenceTurnContextAppenderSchema>;

export function createReferenceTurnContextAppender(): ReferenceTurnContextAppender {
  let messages: Message[] = [];
  return {
    setReferences: (references) => {
      messages = createReferenceTurnContextMessages(references);
    },
    clear: () => {
      messages = [];
    },
    appendTurnContext: async () => messages,
  };
}

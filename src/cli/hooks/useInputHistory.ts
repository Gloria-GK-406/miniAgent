import { z } from "zod";
import { useCallback, useState } from "react";
import { createFunctionSchema, createProtocolSchema } from "../../core/index.js";

const DEFAULT_INPUT_HISTORY_LIMIT = 100;

export function appendInputHistory(
  history: string[],
  input: string,
  limit = DEFAULT_INPUT_HISTORY_LIMIT,
): string[] {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return history;
  }
  const next = history.at(-1) === trimmed ? history : [...history, trimmed];
  return next.slice(-limit);
}

export const InputHistoryControllerSchema = createProtocolSchema({
  entries: z.array(z.string()),
  remember: createFunctionSchema<(input: string) => void>(),
  previous: createFunctionSchema<(currentValue: string) => string | null>(),
  next: createFunctionSchema<() => string | null>(),
  resetNavigation: createFunctionSchema<(currentValue: string) => void>(),
});
export type InputHistoryController = z.infer<typeof InputHistoryControllerSchema>;

export const UseInputHistoryOptionsSchema = z.object({
  initialEntries: z.array(z.string()).optional(),
  limit: z.number().optional(),
  onRemember: createFunctionSchema<(input: string) => void>().optional(),
});
export type UseInputHistoryOptions = z.infer<typeof UseInputHistoryOptionsSchema>;

export function useInputHistory(options: UseInputHistoryOptions = {}): InputHistoryController {
  const limit = options.limit ?? DEFAULT_INPUT_HISTORY_LIMIT;
  const onRemember = options.onRemember;
  const [entries, setEntries] = useState<string[]>(() => (
    options.initialEntries ?? []
  ).slice(-limit));
  const [cursor, setCursor] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const remember = useCallback((input: string): void => {
    const trimmed = input.trim();
    setEntries((current) => appendInputHistory(current, input, limit));
    if (trimmed.length > 0) {
      onRemember?.(trimmed);
    }
    setCursor(null);
    setDraft("");
  }, [limit, onRemember]);

  const previous = useCallback((currentValue: string): string | null => {
    if (entries.length === 0) {
      return null;
    }
    const nextCursor = cursor === null ? entries.length - 1 : Math.max(0, cursor - 1);
    if (cursor === null) {
      setDraft(currentValue);
    }
    setCursor(nextCursor);
    return entries[nextCursor] ?? null;
  }, [cursor, entries]);

  const next = useCallback((): string | null => {
    if (cursor === null) {
      return null;
    }
    if (cursor >= entries.length - 1) {
      setCursor(null);
      const restored = draft;
      setDraft("");
      return restored;
    }
    const nextCursor = cursor + 1;
    setCursor(nextCursor);
    return entries[nextCursor] ?? null;
  }, [cursor, draft, entries]);

  const resetNavigation = useCallback((currentValue: string): void => {
    setCursor(null);
    setDraft(currentValue);
  }, []);

  return {
    entries,
    remember,
    previous,
    next,
    resetNavigation,
  };
}

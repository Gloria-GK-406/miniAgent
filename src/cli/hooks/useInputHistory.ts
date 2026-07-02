import { useCallback, useState } from "react";

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

export interface InputHistoryController {
  entries: string[];
  remember(input: string): void;
  previous(currentValue: string): string | null;
  next(): string | null;
  resetNavigation(currentValue: string): void;
}

export function useInputHistory(limit = DEFAULT_INPUT_HISTORY_LIMIT): InputHistoryController {
  const [entries, setEntries] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const remember = useCallback((input: string): void => {
    setEntries((current) => appendInputHistory(current, input, limit));
    setCursor(null);
    setDraft("");
  }, [limit]);

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

import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useInputHistory } from "../hooks/useInputHistory.js";

interface InputBoxProps {
  onSubmit: (text: string) => void;
  onChange?: (text: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  focused?: boolean;
  placeholder?: string;
  hasSuggestions?: boolean;
  initialHistory?: string[];
  onHistoryEntry?: (input: string) => void;
  onSuggestionNext?: () => void;
  onSuggestionPrev?: () => void;
  onSuggestionComplete?: (currentValue: string) => string | null;
  onModeToggle?: () => void;
}

export type TabInputAction =
  | { type: "complete"; value: string }
  | { type: "toggle-mode" };

export function resolveTabInputAction(
  currentValue: string,
  complete?: (currentValue: string) => string | null,
): TabInputAction {
  const completedValue = complete?.(currentValue) ?? null;
  if (completedValue !== null) {
    return { type: "complete", value: completedValue };
  }
  return { type: "toggle-mode" };
}

export function InputBox({
  onSubmit,
  onChange,
  onCancel,
  disabled = false,
  focused = true,
  placeholder,
  hasSuggestions = false,
  initialHistory,
  onHistoryEntry,
  onSuggestionNext,
  onSuggestionPrev,
  onSuggestionComplete,
  onModeToggle,
}: InputBoxProps) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputHistory = useInputHistory({
    ...(initialHistory !== undefined && { initialEntries: initialHistory }),
    ...(onHistoryEntry !== undefined && { onRemember: onHistoryEntry }),
  });

  const updateValue = (nextValue: string, nextCursor: number, resetHistory = true) => {
    setValue(nextValue);
    setCursor(nextCursor);
    if (resetHistory) {
      inputHistory.resetNavigation(nextValue);
    }
    onChange?.(nextValue);
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onCancel?.();
      return;
    }
    if (disabled) return;
    if (key.tab) {
      const action = resolveTabInputAction(value, onSuggestionComplete);
      if (action.type === "complete") {
        updateValue(action.value, action.value.length);
        return;
      }
      onModeToggle?.();
      return;
    }
    if (key.return) {
      const completedValue = onSuggestionComplete?.(value) ?? null;
      if (completedValue !== null) {
        updateValue(completedValue, completedValue.length);
        return;
      }
      const trimmed = value.trim();
      if (trimmed) {
        inputHistory.remember(trimmed);
        onSubmit(trimmed);
      }
      updateValue("", 0, false);
    } else if (key.leftArrow) {
      setCursor((prev) => Math.max(0, prev - 1));
    } else if (key.rightArrow) {
      setCursor((prev) => Math.min(value.length, prev + 1));
    } else if (key.upArrow) {
      if (hasSuggestions) {
        onSuggestionPrev?.();
        return;
      }
      const previousInput = inputHistory.previous(value);
      if (previousInput !== null) {
        updateValue(previousInput, previousInput.length, false);
        return;
      }
      setCursor(0);
    } else if (key.downArrow) {
      if (hasSuggestions) {
        onSuggestionNext?.();
        return;
      }
      const nextInput = inputHistory.next();
      if (nextInput !== null) {
        updateValue(nextInput, nextInput.length, false);
        return;
      }
      setCursor(value.length);
    } else if (key.backspace || key.delete) {
      if (cursor > 0) {
        const next = value.slice(0, cursor - 1) + value.slice(cursor);
        updateValue(next, cursor - 1);
      }
    } else if (input && !key.ctrl && !key.meta) {
      const next = value.slice(0, cursor) + input + value.slice(cursor);
      updateValue(next, cursor + input.length);
    }
  });

  const before = value.slice(0, cursor);
  const after = value.slice(cursor);

  const cursorChar = focused ? "|" : " ";

  if (disabled) {
    return (
      <Box>
        <Text color="cyan">&gt; </Text>
        <Text dimColor>{placeholder ?? ""}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="cyan">&gt; </Text>
      <Text>{before}</Text>
      <Text>{cursorChar}</Text>
      <Text>{after}</Text>
    </Box>
  );
}

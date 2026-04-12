import { useState } from "react";
import { Box, Text, useInput } from "ink";

interface InputBoxProps {
  onSubmit: (text: string) => void;
  onChange?: (text: string) => void;
  disabled?: boolean;
  focused?: boolean;
  placeholder?: string;
  hasSuggestions?: boolean;
  onSuggestionNext?: () => void;
  onSuggestionPrev?: () => void;
  onSuggestionComplete?: (currentValue: string) => string | null;
}

export function InputBox({
  onSubmit,
  onChange,
  disabled = false,
  focused = true,
  placeholder,
  hasSuggestions = false,
  onSuggestionNext,
  onSuggestionPrev,
  onSuggestionComplete,
}: InputBoxProps) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);

  const updateValue = (nextValue: string, nextCursor: number) => {
    setValue(nextValue);
    setCursor(nextCursor);
    onChange?.(nextValue);
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      process.exit(0);
    }
    if (disabled) return;
    if (key.return) {
      const completedValue = onSuggestionComplete?.(value) ?? null;
      if (completedValue !== null) {
        updateValue(completedValue, completedValue.length);
        return;
      }
      const trimmed = value.trim();
      if (trimmed) onSubmit(trimmed);
      updateValue("", 0);
    } else if (key.leftArrow) {
      setCursor((prev) => Math.max(0, prev - 1));
    } else if (key.rightArrow) {
      setCursor((prev) => Math.min(value.length, prev + 1));
    } else if (key.upArrow) {
      if (hasSuggestions) {
        onSuggestionPrev?.();
        return;
      }
      setCursor(0);
    } else if (key.downArrow) {
      if (hasSuggestions) {
        onSuggestionNext?.();
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

  const cursorChar = focused ? "█" : "▯";

  if (disabled) {
    return (
      <Box>
        <Text color="cyan">❯ </Text>
        <Text dimColor>{placeholder ?? ""}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="cyan">❯ </Text>
      <Text>{before}</Text>
      <Text>{cursorChar}</Text>
      <Text>{after}</Text>
    </Box>
  );
}

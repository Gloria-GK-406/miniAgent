import { Box, Text } from "ink";

const MAX_VISIBLE_SUGGESTIONS = 5;

interface CommandPaletteProps {
  suggestions: string[];
  selectedIndex: number;
}

export function CommandPalette({
  suggestions,
  selectedIndex,
}: CommandPaletteProps) {
  if (suggestions.length === 0) return null;

  const maxStart = Math.max(0, suggestions.length - MAX_VISIBLE_SUGGESTIONS);
  const startIndex = Math.min(
    Math.max(0, selectedIndex - Math.floor(MAX_VISIBLE_SUGGESTIONS / 2)),
    maxStart,
  );
  const endIndex = startIndex + MAX_VISIBLE_SUGGESTIONS;
  const visibleSuggestions = suggestions.slice(startIndex, endIndex);

  return (
    <Box
      borderStyle="round"
      borderColor="gray"
      flexDirection="column"
      marginBottom={1}
      paddingX={1}
    >
      {startIndex > 0 && <Text dimColor>  up more</Text>}
      {visibleSuggestions.map((suggestion, index) => {
        const absoluteIndex = startIndex + index;

        return (
          <Text
            key={`${absoluteIndex}:${suggestion}`}
            bold={absoluteIndex === selectedIndex}
            inverse={absoluteIndex === selectedIndex}
            dimColor={absoluteIndex !== selectedIndex}
          >
            {absoluteIndex === selectedIndex ? "> " : "  "}
            {suggestion}
          </Text>
        );
      })}
      {endIndex < suggestions.length && <Text dimColor>  down more</Text>}
    </Box>
  );
}

import { useCallback, useState } from "react";

const COMMANDS = [
  "/activity",
  "/agent",
  "/auto",
  "/compact",
  "/context",
  "/details",
  "/diff",
  "/diagnostics",
  "/editor",
  "/exit",
  "/export",
  "/git",
  "/help",
  "/history",
  "/import",
  "/init",
  "/model",
  "/models",
  "/new",
  "/permissions",
  "/quit",
  "/redo",
  "/session",
  "/sessions",
  "/system",
  "/thinking",
  "/tools",
  "/undo",
];

const AGENT_SUBS = ["build", "plan"];
const COMMANDS_WITH_ARGS = new Set([
  "/agent",
  "/diff",
  "/editor",
  "/export",
  "/git",
  "/import",
  "/init",
  "/model",
  "/new",
  "/permissions",
  "/sessions",
]);

export function matchSuggestions(
  input: string,
  modelPaths?: string[],
): string[] {
  if (!input) return [];
  if (!input.startsWith("/")) return [];

  const parts = input.trimStart().split(/\s+/);
  const cmd = parts[0] ?? "";

  if (parts.length >= 2) {
    const partial = parts[parts.length - 1] ?? "";

    if (cmd === "/model") {
      return (modelPaths ?? []).filter((p) => p.startsWith(partial));
    }
    if (cmd === "/agent") {
      return AGENT_SUBS.filter((s) => s.startsWith(partial));
    }
    return [];
  }

  const matches = COMMANDS.filter((c) => c.startsWith(cmd));

  if (matches.length === 1 && matches[0] === cmd) {
    if (cmd === "/agent") return AGENT_SUBS;
    return [];
  }

  return matches;
}

export function applySuggestion(input: string, suggestion: string): string {
  const leadingWhitespace = input.match(/^\s*/)?.[0] ?? "";
  const commandInput = input.slice(leadingWhitespace.length);

  if (!commandInput.startsWith("/")) {
    return input;
  }

  if (suggestion.startsWith("/")) {
    if (commandInput === suggestion) {
      return input;
    }
    return `${leadingWhitespace}${suggestion}${COMMANDS_WITH_ARGS.has(suggestion) ? " " : ""}`;
  }

  const trimmedInput = commandInput.trim();
  if (trimmedInput === "") {
    return input;
  }

  const parts = trimmedInput.split(/\s+/);
  const endsWithSpace = /\s$/.test(commandInput);
  const lastPart = parts[parts.length - 1];

  if (!endsWithSpace && lastPart === suggestion) {
    return input;
  }

  if (parts.length === 1) {
    return `${leadingWhitespace}${parts[0]} ${suggestion} `;
  }

  if (endsWithSpace) {
    return `${leadingWhitespace}${parts.join(" ")} ${suggestion} `;
  }

  const prefix = parts.slice(0, -1).join(" ");
  return `${leadingWhitespace}${prefix} ${suggestion} `;
}

export interface UseSuggestionOptions {
  modelPaths?: string[];
}

export function useSuggestion(options?: UseSuggestionOptions) {
  const modelPaths = options?.modelPaths;
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectNext = useCallback((): void => {
    setSelectedIndex((prev) => {
      if (suggestions.length === 0) {
        return prev;
      }
      return (prev + 1) % suggestions.length;
    });
  }, [suggestions]);

  const selectPrev = useCallback((): void => {
    setSelectedIndex((prev) => {
      if (suggestions.length === 0) {
        return prev;
      }
      return (prev - 1 + suggestions.length) % suggestions.length;
    });
  }, [suggestions]);

  const resetSelection = useCallback((): void => {
    setSelectedIndex(0);
  }, []);

  const updateInput = useCallback((input: string): void => {
    setSuggestions(matchSuggestions(input, modelPaths));
    setSelectedIndex(0);
  }, [modelPaths]);

  const applySelected = useCallback((input: string): string | null => {
    const suggestion = suggestions[selectedIndex];
    if (suggestion === undefined) {
      return null;
    }
    const nextInput = applySuggestion(input, suggestion);
    return nextInput === input ? null : nextInput;
  }, [selectedIndex, suggestions]);

  return {
    suggestions,
    selectedIndex,
    hasSuggestions: suggestions.length > 0,
    selectNext,
    selectPrev,
    resetSelection,
    updateInput,
    applySelected,
  };
}

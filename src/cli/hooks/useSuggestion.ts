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
  "/doctor",
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
  "/permission",
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

const AGENT_SUBS = ["list", "build", "plan"];
const EXPORT_FORMATS = ["json", "markdown"];
const GIT_SUBS = ["status", "log"];
const PERMISSION_SUBS = ["set", "unset"];
const SESSION_SUBS = ["search", "new", "switch", "fork", "rename", "delete"];
const SYSTEM_SUBS = ["set", "unset"];
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
  "/permission",
  "/permissions",
  "/sessions",
  "/system",
]);

export function matchSuggestions(
  input: string,
  modelPaths?: string[],
  referencePaths?: string[],
): string[] {
  if (!input) return [];
  if (!input.startsWith("/")) {
    const referenceQuery = getReferenceQuery(input);
    if (referenceQuery === null) return [];
    return (referencePaths ?? [])
      .filter((path) => isReferenceMatch(path, referenceQuery))
      .sort((a, b) => referenceRank(a, referenceQuery) - referenceRank(b, referenceQuery))
      .map((path) => `@${path}`);
  }

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
    if (cmd === "/export") {
      return EXPORT_FORMATS.filter((s) => s.startsWith(partial));
    }
    if (cmd === "/git") {
      return GIT_SUBS.filter((s) => s.startsWith(partial));
    }
    if (cmd === "/permissions" || cmd === "/permission") {
      return PERMISSION_SUBS.filter((s) => s.startsWith(partial));
    }
    if (cmd === "/sessions" || cmd === "/session") {
      return SESSION_SUBS.filter((s) => s.startsWith(partial));
    }
    if (cmd === "/system") {
      return SYSTEM_SUBS.filter((s) => s.startsWith(partial));
    }
    return [];
  }

  const matches = COMMANDS.filter((c) => c.startsWith(cmd));

  if (matches.length === 1 && matches[0] === cmd) {
    if (cmd === "/agent") return AGENT_SUBS;
    if (cmd === "/export") return EXPORT_FORMATS;
    if (cmd === "/git") return GIT_SUBS;
    if (cmd === "/permissions" || cmd === "/permission") return PERMISSION_SUBS;
    if (cmd === "/sessions" || cmd === "/session") return SESSION_SUBS;
    if (cmd === "/system") return SYSTEM_SUBS;
    return [];
  }

  return matches;
}

function getReferenceQuery(input: string): string | null {
  const match = /(?:^|\s)@([^\s]*)$/.exec(input);
  return match === null ? null : match[1]!;
}

function isReferenceMatch(path: string, query: string): boolean {
  const normalizedPath = path.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  if (normalizedQuery.length === 0) return true;
  if (normalizedPath.startsWith(normalizedQuery)) return true;

  let queryIndex = 0;
  for (const char of normalizedPath) {
    if (char === normalizedQuery[queryIndex]) {
      queryIndex++;
      if (queryIndex === normalizedQuery.length) {
        return true;
      }
    }
  }
  return false;
}

function referenceRank(path: string, query: string): number {
  const normalizedPath = path.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  if (normalizedPath.startsWith(normalizedQuery)) return 0;
  if (normalizedPath.includes(normalizedQuery)) return 1;
  return 2;
}

export function applySuggestion(input: string, suggestion: string): string {
  if (suggestion.startsWith("@")) {
    const match = /(^|\s)@[^\s]*$/.exec(input);
    if (match === null) {
      return input;
    }
    const tokenStart = match.index + match[1]!.length;
    const nextInput = `${input.slice(0, tokenStart)}${suggestion}`;
    return nextInput === input ? input : `${nextInput} `;
  }

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
  referencePaths?: string[];
}

export function useSuggestion(options?: UseSuggestionOptions) {
  const modelPaths = options?.modelPaths;
  const referencePaths = options?.referencePaths;
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
    setSuggestions(matchSuggestions(input, modelPaths, referencePaths));
    setSelectedIndex(0);
  }, [modelPaths, referencePaths]);

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

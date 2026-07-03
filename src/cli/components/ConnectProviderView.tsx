import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  CONNECT_PROVIDER_OPTIONS,
  buildProviderConnection,
  type ConnectProviderOption,
} from "../provider-catalog.js";
import type { CLIProviderConnection } from "../runtime/types.js";

interface ConnectProviderViewProps {
  onConnect: (connection: CLIProviderConnection) => Promise<void> | void;
  onClose: () => void;
}

type ConnectStep = "provider" | "apiKey" | "baseURL" | "modelId";

function providerMatches(option: ConnectProviderOption, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }
  return [
    option.label,
    option.engine,
    option.id,
  ].some((value) => value.toLowerCase().includes(normalized));
}

function promptForStep(step: ConnectStep): string {
  switch (step) {
    case "apiKey":
      return "API key";
    case "baseURL":
      return "Base URL";
    case "modelId":
      return "Model id";
    case "provider":
      return "Search";
  }
}

function nextStep(option: ConnectProviderOption, step: ConnectStep): ConnectStep | null {
  if (step === "apiKey") {
    if (option.requiresBaseURL) return "baseURL";
    if (option.requiresModel) return "modelId";
    return null;
  }
  if (step === "baseURL") {
    return option.requiresModel ? "modelId" : null;
  }
  return null;
}

function maskedSecret(value: string): string {
  return value.length === 0 ? "" : "*".repeat(Math.min(value.length, 24));
}

export function ConnectProviderView({ onConnect, onClose }: ConnectProviderViewProps) {
  const [step, setStep] = useState<ConnectStep>("provider");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<ConnectProviderOption | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [modelId, setModelId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const visibleProviders = useMemo(
    () => CONNECT_PROVIDER_OPTIONS.filter((option) => providerMatches(option, query)),
    [query],
  );
  const maxIndex = Math.max(0, visibleProviders.length - 1);
  const clampedIndex = Math.min(selectedIndex, maxIndex);
  const currentProvider = selectedProvider ?? visibleProviders[clampedIndex] ?? null;

  const currentValue = step === "apiKey"
    ? apiKey
    : step === "baseURL"
      ? baseURL
      : step === "modelId"
        ? modelId
        : query;

  const setCurrentValue = (value: string): void => {
    setError(null);
    if (step === "apiKey") {
      setApiKey(value);
      return;
    }
    if (step === "baseURL") {
      setBaseURL(value);
      return;
    }
    if (step === "modelId") {
      setModelId(value);
      return;
    }
    setQuery(value);
    setSelectedIndex(0);
  };

  const submitConnection = (provider: ConnectProviderOption): void => {
    let connection: CLIProviderConnection;
    try {
      connection = buildProviderConnection({
        providerId: provider.id,
        apiKey,
        ...(baseURL.trim().length > 0 && { baseURL }),
        ...(modelId.trim().length > 0 && { modelId }),
      });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }

    setIsSubmitting(true);
    void Promise.resolve(onConnect(connection))
      .then(() => {
        setIsSubmitting(false);
        onClose();
      })
      .catch((cause: unknown) => {
        setIsSubmitting(false);
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  };

  useInput((input, key) => {
    if (key.escape) {
      if (!isSubmitting) {
        onClose();
      }
      return;
    }
    if (isSubmitting) {
      return;
    }

    if (step === "provider") {
      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((prev) => Math.min(maxIndex, prev + 1));
        return;
      }
      if (key.return) {
        const provider = visibleProviders[clampedIndex];
        if (provider === undefined) {
          return;
        }
        setSelectedProvider(provider);
        setStep("apiKey");
        setError(null);
        return;
      }
    } else if (key.return) {
      if (currentProvider === null) {
        setStep("provider");
        return;
      }
      const followingStep = nextStep(currentProvider, step);
      if (followingStep === null) {
        submitConnection(currentProvider);
        return;
      }
      setStep(followingStep);
      setError(null);
      return;
    }

    if (key.backspace || key.delete) {
      setCurrentValue(currentValue.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setCurrentValue(currentValue + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color="cyan">Connect a provider</Text>
        <Text dimColor>esc</Text>
      </Box>
      {step === "provider" ? (
        <>
          <Text>
            <Text color="cyan">Search</Text>
            <Text> {query}</Text>
            <Text>|</Text>
          </Text>
          <Box flexDirection="column">
            {visibleProviders.length === 0 ? (
              <Text dimColor>No providers found</Text>
            ) : (
              visibleProviders.map((provider, index) => {
                const selected = index === clampedIndex;
                return (
                  <Text
                    key={provider.id}
                    inverse={selected}
                    bold={selected}
                    dimColor={!selected}
                  >
                    {selected ? "> " : "  "}
                    {provider.label}
                  </Text>
                );
              })
            )}
          </Box>
          <Text dimColor>Enter select | ESC close</Text>
        </>
      ) : (
        <>
          <Text dimColor>{currentProvider?.label ?? "Provider"}</Text>
          <Text>
            <Text color="cyan">{promptForStep(step)}</Text>
            <Text> </Text>
            <Text>{step === "apiKey" ? maskedSecret(currentValue) : currentValue}</Text>
            <Text>|</Text>
          </Text>
          <Text dimColor>{isSubmitting ? "Saving..." : "Enter submit | ESC close"}</Text>
        </>
      )}
      {error !== null && <Text color="red">{error}</Text>}
    </Box>
  );
}

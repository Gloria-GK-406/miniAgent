const REDACTED = "<redacted>";

const SENSITIVE_KEY_NAMES = new Set([
  "key",
  "apikey",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "clientsecret",
  "password",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.replace(/[-_\s]/g, "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_NAMES.has(normalized) ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password");
}

export function redactConfigForDisplay(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactConfigForDisplay(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    redacted[key] = isSensitiveKey(key) ? REDACTED : redactConfigForDisplay(item);
  }
  return redacted;
}

export function formatConfigForDisplay(config: unknown): string {
  return `${JSON.stringify(redactConfigForDisplay(config), null, 2)}\n`;
}

import { type z } from "zod";
import { createTokenCount, emptyTokenCount } from "./llm.js";
import { createFunctionSchema } from "./function-schema.js";
import { createProtocolSchema } from "./protocol-schema.js";
import { TokenCountSchema, type TokenCount } from "./types.js";

export const TokenUsageReporterSchema = createProtocolSchema({
  reportTokenUsage: createFunctionSchema<(tokenCount: TokenCount) => void>(),
});

export type TokenUsageReporter = z.infer<typeof TokenUsageReporterSchema>;

export const TokenUsageReaderSchema = createProtocolSchema({
  getTokenUsage: createFunctionSchema<() => TokenCount>(),
});

export type TokenUsageReader = z.infer<typeof TokenUsageReaderSchema>;

export const TokenUsageResetterSchema = createProtocolSchema({
  resetTokenUsage: createFunctionSchema<() => void>(),
});

export type TokenUsageResetter = z.infer<typeof TokenUsageResetterSchema>;

export const TokenUsageServiceSchema = createProtocolSchema({
  reportTokenUsage: createFunctionSchema<(tokenCount: TokenCount) => void>(),
  getTokenUsage: createFunctionSchema<() => TokenCount>(),
  resetTokenUsage: createFunctionSchema<() => void>(),
});

export type TokenUsageService = z.infer<typeof TokenUsageServiceSchema>;

export class TokenUsageCounter implements TokenUsageService {
  private total: TokenCount = emptyTokenCount();

  reportTokenUsage(tokenCount: TokenCount): void {
    const parsed = TokenCountSchema.parse(tokenCount);
    this.total = createTokenCount(
      this.total.input + parsed.input,
      this.total.output + parsed.output,
    );
  }

  getTokenUsage(): TokenCount {
    return { ...this.total };
  }

  resetTokenUsage(): void {
    this.total = emptyTokenCount();
  }
}

export function createTokenUsageService(): TokenUsageService {
  return new TokenUsageCounter();
}

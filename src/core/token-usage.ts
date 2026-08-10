import { z } from "zod";
import { createTokenCount, emptyTokenCount } from "./llm.js";
import { createFunctionSchema } from "./function-schema.js";
import { TokenCountSchema, type TokenCount } from "./types.js";

export const TokenUsageReporterSchema = z.object({
  reportTokenUsage: createFunctionSchema<(tokenCount: TokenCount) => void>(),
});

export type TokenUsageReporter = z.infer<typeof TokenUsageReporterSchema>;

export const TokenUsageReaderSchema = z.object({
  getTokenUsage: createFunctionSchema<() => TokenCount>(),
});

export type TokenUsageReader = z.infer<typeof TokenUsageReaderSchema>;

export const TokenUsageResetterSchema = z.object({
  resetTokenUsage: createFunctionSchema<() => void>(),
});

export type TokenUsageResetter = z.infer<typeof TokenUsageResetterSchema>;

export const TokenUsageServiceSchema = z.object({
  reportTokenUsage: TokenUsageReporterSchema.shape.reportTokenUsage,
  getTokenUsage: TokenUsageReaderSchema.shape.getTokenUsage,
  resetTokenUsage: TokenUsageResetterSchema.shape.resetTokenUsage,
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

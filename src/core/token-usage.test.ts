import { describe, expect, it } from "vitest";
import {
  TokenUsageCounter,
  type TokenUsageReporter,
  type TokenUsageService,
} from "./token-usage.js";

function reportOne(reporter: TokenUsageReporter): void {
  reporter.reportTokenUsage({ input: 1, output: 2, total: 3 });
}

describe("TokenUsageCounter", () => {
  it("combines reporting, reading, and resetting behind one service", () => {
    const service: TokenUsageService = new TokenUsageCounter();

    reportOne(service);
    service.reportTokenUsage({ input: 4, output: 5, total: 9 });

    expect(service.getTokenUsage()).toEqual({ input: 5, output: 7, total: 12 });
    service.resetTokenUsage();
    expect(service.getTokenUsage()).toEqual({ input: 0, output: 0, total: 0 });
  });

  it("returns defensive values and derives total from input plus output", () => {
    const service: TokenUsageService = new TokenUsageCounter();
    service.reportTokenUsage({ input: 2, output: 3, total: 999 });

    const first = service.getTokenUsage();
    first.input = 100;

    expect(service.getTokenUsage()).toEqual({ input: 2, output: 3, total: 5 });
  });
});

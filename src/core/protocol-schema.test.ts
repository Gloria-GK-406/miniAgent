import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createFunctionSchema } from "./function-schema.js";
import { LLMEngineManager } from "./llm.js";
import { MemoryStore, StoreSchema } from "./persistence.js";
import { createProtocolSchema } from "./protocol-schema.js";
import { LLMRequestSchema } from "./types.js";

class StatefulService {
  private count = 0;

  increment(): number {
    this.count += 1;
    return this.count;
  }
}

describe("createProtocolSchema", () => {
  const StatefulServiceSchema = createProtocolSchema({
    increment: createFunctionSchema<() => number>(),
  });

  it("keeps public class-backed protocols usable", async () => {
    const store = new MemoryStore();
    const manager = new LLMEngineManager();

    const parsedStore = StoreSchema.parse(store);
    const parsedManager = LLMRequestSchema.parse(manager);

    expect(parsedStore).toBe(store);
    expect(parsedManager).toBe(manager);
    await parsedStore.writeFile("state.txt", "ok");
    await expect(parsedStore.readFile("state.txt")).resolves.toBe("ok");
  });

  it("validates a protocol without replacing its identity", () => {
    const service = new StatefulService();

    const parsed = StatefulServiceSchema.parse(service);

    expect(parsed).toBe(service);
    expect(parsed.increment()).toBe(1);
  });

  it.each([42, null, {}, { increment: "not-a-function" }])(
    "rejects invalid protocol candidate %j",
    (candidate) => {
      expect(StatefulServiceSchema.safeParse(candidate).success).toBe(false);
    },
  );

  it("retains the structural schema output type", () => {
    const schema = createProtocolSchema({
      name: z.string(),
      run: createFunctionSchema<() => void>(),
    });
    const candidate = { name: "service", run: (): void => {} };

    expect(schema.parse(candidate)).toBe(candidate);
  });
});

import { describe, expect, it } from "vitest";
import { createFunctionSchema } from "./function-schema.js";

describe("createFunctionSchema", () => {
  const FunctionSchema = createFunctionSchema<
    (value: string) => Promise<number>
  >();

  it("accepts functions without wrapping them", () => {
    const candidate = async (value: string): Promise<number> => value.length;

    const result = FunctionSchema.parse(candidate);

    expect(result).toBe(candidate);
  });

  it.each([undefined, null, "function", {}, []])(
    "rejects non-function value %j",
    (candidate) => {
      expect(FunctionSchema.safeParse(candidate).success).toBe(false);
    },
  );
});

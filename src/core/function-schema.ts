import { z } from "zod";

type AnyFunction = (...args: never[]) => unknown;

export function createFunctionSchema<T extends AnyFunction>() {
  return z.custom<T>((value) => typeof value === "function");
}

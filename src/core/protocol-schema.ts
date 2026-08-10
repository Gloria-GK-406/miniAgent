import { z } from "zod";

/**
 * Validates an identity-bearing structural protocol without returning Zod's
 * object projection. This keeps class instances and stateful receivers intact.
 */
export function createProtocolSchema<const Shape extends z.ZodRawShape>(shape: Shape) {
  const structuralSchema = z.object(shape);

  return z.custom<z.output<typeof structuralSchema>>(
    (value) => structuralSchema.safeParse(value).success,
  );
}
